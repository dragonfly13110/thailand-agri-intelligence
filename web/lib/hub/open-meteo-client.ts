/**
 * Open-Meteo Weather & Agrometeorology Client for Thailand Agri Intelligence Hub.
 *
 * Isomorphic client: works in Server Components, Route Handlers, and Client Components.
 *
 * GOVERNANCE GATE (2026-10-25): the Open-Meteo service/attribution rights are
 * still `pending` in `config/resource_licenses.json`. Do **not** import this
 * module from a public route or Server Component until the register is
 * approved and an approved active batch exists in D1. `GET
 * /api/v1/weather-engine` currently answers 503 SOURCE_UNAVAILABLE and never
 * calls this client.
 *
 * Attribution (CC BY 4.0):
 * - "Weather data by Open-Meteo.com" (https://open-meteo.com/)
 * - Spatial Support: Grid Point estimation (~0.25° ERA5 reanalysis / ~0.1° ECMWF forecast).
 * - Not a ground meteorological observation station (TMD).
 */

export const OPEN_METEO_ATTRIBUTION = 'Weather data by Open-Meteo.com';
export const OPEN_METEO_URL = 'https://open-meteo.com/';
export const OPEN_METEO_LICENSE = 'CC BY 4.0';
export const OPEN_METEO_SPATIAL_SUPPORT = 'grid_point';
export const OPEN_METEO_GRID_RESOLUTION = '0.25° (~27km) ERA5 / 0.1° (~11km) ECMWF';

export const OPEN_METEO_FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';

export interface ProvinceCentroid {
  code: string;
  nameTh: string;
  nameEn: string;
  lat: number;
  lon: number;
  region: 'central' | 'east' | 'northeast' | 'north' | 'south';
}

export interface RawOpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  elevation?: number;
  is_fallback?: boolean;
  daily_units?: Record<string, string>;
  daily?: {
    time: string[];
    precipitation_sum?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_mean?: (number | null)[];
    et0_fao_evapotranspiration?: (number | null)[];
    relative_humidity_2m_mean?: (number | null)[];
    relative_humidity_2m_max?: (number | null)[];
    relative_humidity_2m_min?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

export type HeatIndexCategory = 'normal' | 'caution' | 'extreme_caution' | 'danger' | 'extreme_danger';

export interface HeatIndexResult {
  heatIndexC: number;
  category: HeatIndexCategory;
  labelTh: string;
  advisoryTh: string;
}

export interface CropWaterRequirementResult {
  cropKey: string;
  cropNameTh: string;
  stage: 'initial' | 'mid' | 'end';
  kc: number;
  et0Mm: number;
  etcMm: number;
  waterVolumeM3PerRai: number;
  criticalStageNote: string;
}

export interface AgroDailyRecord {
  date: string;
  precipitationMm: number;
  tempMaxC: number;
  tempMinC: number;
  tempMeanC: number;
  et0FaoMm: number;
  relativeHumidityPct: number;
  windSpeedMaxKmh: number;
  heatIndexC: number;
  heatIndexCategory: HeatIndexCategory;
  heatIndexLabelTh: string;
  waterBalanceMm: number; // P - ET0
  cropWaterNeedMm: number; // ETc = Kc * ET0
  cropWaterDeficitMm: number; // P - ETc
}

export interface AgroPeriodSummary {
  days: number;
  totalPrecipitationMm: number;
  totalEt0Mm: number;
  avgDailyEt0Mm: number;
  netWaterBalanceMm: number;
  moistureStatus: 'severe_water_deficit' | 'moderate_water_deficit' | 'balanced' | 'water_surplus';
  moistureLabelTh: string;
  maxHeatIndexC: number;
  worstHeatStressLevel: HeatIndexCategory;
}

export interface ProvinceAgroAnalysis {
  provinceCode: string;
  provinceNameTh: string;
  provinceNameEn: string;
  region: string;
  coordinates: { lat: number; lon: number };
  cropEvaluated: string;
  periodSummary: AgroPeriodSummary;
  dailyRecords: AgroDailyRecord[];
  metadata: {
    source: string;
    attribution: string;
    sourceUrl: string;
    license: string;
    spatialSupport: string;
    gridResolution: string;
    isFallback: boolean;
    note: string;
  };
}

/** 77 Thai provinces standard centroids */
export const THAILAND_PROVINCE_CENTROIDS: Record<string, ProvinceCentroid> = {
  '10': { code: '10', nameTh: 'กรุงเทพมหานคร', nameEn: 'Bangkok', lat: 13.7563, lon: 100.5018, region: 'central' },
  '11': { code: '11', nameTh: 'สมุทรปราการ', nameEn: 'Samut Prakan', lat: 13.5991, lon: 100.5998, region: 'central' },
  '12': { code: '12', nameTh: 'นนทบุรี', nameEn: 'Nonthaburi', lat: 13.8621, lon: 100.5144, region: 'central' },
  '13': { code: '13', nameTh: 'ปทุมธานี', nameEn: 'Pathum Thani', lat: 14.0208, lon: 100.525, region: 'central' },
  '14': { code: '14', nameTh: 'พระนครศรีอยุธยา', nameEn: 'Phra Nakhon Si Ayutthaya', lat: 14.3532, lon: 100.5684, region: 'central' },
  '15': { code: '15', nameTh: 'อ่างทอง', nameEn: 'Ang Thong', lat: 14.5896, lon: 100.455, region: 'central' },
  '16': { code: '16', nameTh: 'ลพบุรี', nameEn: 'Lop Buri', lat: 14.7995, lon: 100.6534, region: 'central' },
  '17': { code: '17', nameTh: 'สิงห์บุรี', nameEn: 'Sing Buri', lat: 14.8936, lon: 100.4015, region: 'central' },
  '18': { code: '18', nameTh: 'ชัยนาท', nameEn: 'Chai Nat', lat: 15.1852, lon: 100.1251, region: 'central' },
  '19': { code: '19', nameTh: 'สระบุรี', nameEn: 'Saraburi', lat: 14.5289, lon: 100.9101, region: 'central' },
  '20': { code: '20', nameTh: 'ชลบุรี', nameEn: 'Chon Buri', lat: 13.3611, lon: 100.9847, region: 'east' },
  '21': { code: '21', nameTh: 'ระยอง', nameEn: 'Rayong', lat: 12.6814, lon: 101.2816, region: 'east' },
  '22': { code: '22', nameTh: 'จันทบุรี', nameEn: 'Chanthaburi', lat: 12.6114, lon: 102.1039, region: 'east' },
  '23': { code: '23', nameTh: 'ตราด', nameEn: 'Trat', lat: 12.2428, lon: 102.5175, region: 'east' },
  '24': { code: '24', nameTh: 'ฉะเชิงเทรา', nameEn: 'Chachoengsao', lat: 13.6904, lon: 101.078, region: 'east' },
  '25': { code: '25', nameTh: 'ปราจีนบุรี', nameEn: 'Prachin Buri', lat: 14.0509, lon: 101.3734, region: 'east' },
  '26': { code: '26', nameTh: 'นครนายก', nameEn: 'Nakhon Nayok', lat: 14.2069, lon: 101.2131, region: 'east' },
  '27': { code: '27', nameTh: 'สระแก้ว', nameEn: 'Sa Kaeo', lat: 13.824, lon: 102.0646, region: 'east' },
  '30': { code: '30', nameTh: 'นครราชสีมา', nameEn: 'Nakhon Ratchasima', lat: 14.9799, lon: 102.0978, region: 'northeast' },
  '31': { code: '31', nameTh: 'บุรีรัมย์', nameEn: 'Buri Ram', lat: 14.993, lon: 103.1029, region: 'northeast' },
  '32': { code: '32', nameTh: 'สุรินทร์', nameEn: 'Surin', lat: 14.8818, lon: 103.4936, region: 'northeast' },
  '33': { code: '33', nameTh: 'ศรีสะเกษ', nameEn: 'Si Sa Ket', lat: 15.1186, lon: 104.322, region: 'northeast' },
  '34': { code: '34', nameTh: 'อุบลราชธานี', nameEn: 'Ubon Ratchathani', lat: 15.2449, lon: 104.8473, region: 'northeast' },
  '35': { code: '35', nameTh: 'ยโสธร', nameEn: 'Yasothon', lat: 15.7926, lon: 104.1453, region: 'northeast' },
  '36': { code: '36', nameTh: 'ชัยภูมิ', nameEn: 'Chaiyaphum', lat: 15.8105, lon: 102.0315, region: 'northeast' },
  '37': { code: '37', nameTh: 'อำนาจเจริญ', nameEn: 'Amnat Charoen', lat: 15.8584, lon: 104.6258, region: 'northeast' },
  '38': { code: '38', nameTh: 'บึงกาฬ', nameEn: 'Bueng Kan', lat: 18.3609, lon: 103.6465, region: 'northeast' },
  '39': { code: '39', nameTh: 'หนองบัวลำภู', nameEn: 'Nong Bua Lam Phu', lat: 17.2043, lon: 102.441, region: 'northeast' },
  '40': { code: '40', nameTh: 'ขอนแก่น', nameEn: 'Khon Kaen', lat: 16.4322, lon: 102.8236, region: 'northeast' },
  '41': { code: '41', nameTh: 'อุดรธานี', nameEn: 'Udon Thani', lat: 17.4138, lon: 102.7872, region: 'northeast' },
  '42': { code: '42', nameTh: 'เลย', nameEn: 'Loei', lat: 17.486, lon: 101.7223, region: 'northeast' },
  '43': { code: '43', nameTh: 'หนองคาย', nameEn: 'Nong Khai', lat: 17.8783, lon: 102.742, region: 'northeast' },
  '44': { code: '44', nameTh: 'มหาสารคาม', nameEn: 'Maha Sarakham', lat: 16.1851, lon: 103.3007, region: 'northeast' },
  '45': { code: '45', nameTh: 'ร้อยเอ็ด', nameEn: 'Roi Et', lat: 16.0538, lon: 103.652, region: 'northeast' },
  '46': { code: '46', nameTh: 'กาฬสินธุ์', nameEn: 'Kalasin', lat: 16.4328, lon: 103.5065, region: 'northeast' },
  '47': { code: '47', nameTh: 'สกลนคร', nameEn: 'Sakon Nakhon', lat: 17.1546, lon: 104.1486, region: 'northeast' },
  '48': { code: '48', nameTh: 'นครพนม', nameEn: 'Nakhon Phanom', lat: 17.4077, lon: 104.7801, region: 'northeast' },
  '49': { code: '49', nameTh: 'มุกดาหาร', nameEn: 'Mukdahan', lat: 16.5434, lon: 104.7235, region: 'northeast' },
  '50': { code: '50', nameTh: 'เชียงใหม่', nameEn: 'Chiang Mai', lat: 18.7953, lon: 98.962, region: 'north' },
  '51': { code: '51', nameTh: 'ลำพูน', nameEn: 'Lamphun', lat: 18.5745, lon: 99.0087, region: 'north' },
  '52': { code: '52', nameTh: 'ลำปาง', nameEn: 'Lampang', lat: 18.2888, lon: 99.4928, region: 'north' },
  '53': { code: '53', nameTh: 'อุตรดิตถ์', nameEn: 'Uttaradit', lat: 17.6201, lon: 100.0993, region: 'north' },
  '54': { code: '54', nameTh: 'แพร่', nameEn: 'Phrae', lat: 18.1446, lon: 100.1403, region: 'north' },
  '55': { code: '55', nameTh: 'น่าน', nameEn: 'Nan', lat: 18.7756, lon: 100.773, region: 'north' },
  '56': { code: '56', nameTh: 'พะเยา', nameEn: 'Phayao', lat: 19.1664, lon: 99.9022, region: 'north' },
  '57': { code: '57', nameTh: 'เชียงราย', nameEn: 'Chiang Rai', lat: 19.9072, lon: 99.8325, region: 'north' },
  '58': { code: '58', nameTh: 'แม่ฮ่องสอน', nameEn: 'Mae Hong Son', lat: 19.302, lon: 97.9654, region: 'north' },
  '60': { code: '60', nameTh: 'นครสวรรค์', nameEn: 'Nakhon Sawan', lat: 15.7047, lon: 100.1371, region: 'north' },
  '61': { code: '61', nameTh: 'อุทัยธานี', nameEn: 'Uthai Thani', lat: 15.3835, lon: 100.0245, region: 'north' },
  '62': { code: '62', nameTh: 'กำแพงเพชร', nameEn: 'Kamphaeng Phet', lat: 16.4828, lon: 99.5227, region: 'north' },
  '63': { code: '63', nameTh: 'ตาก', nameEn: 'Tak', lat: 16.8839, lon: 99.1259, region: 'north' },
  '64': { code: '64', nameTh: 'สุโขทัย', nameEn: 'Sukhothai', lat: 17.0078, lon: 99.8235, region: 'north' },
  '65': { code: '65', nameTh: 'พิษณุโลก', nameEn: 'Phitsanulok', lat: 16.8211, lon: 100.2659, region: 'north' },
  '66': { code: '66', nameTh: 'พิจิตร', nameEn: 'Phichit', lat: 16.4429, lon: 100.3488, region: 'north' },
  '67': { code: '67', nameTh: 'เพชรบูรณ์', nameEn: 'Phetchabun', lat: 16.419, lon: 101.1566, region: 'north' },
  '70': { code: '70', nameTh: 'ราชบุรี', nameEn: 'Ratchaburi', lat: 13.5283, lon: 99.8134, region: 'central' },
  '71': { code: '71', nameTh: 'กาญจนบุรี', nameEn: 'Kanchanaburi', lat: 13.9984, lon: 99.5328, region: 'central' },
  '72': { code: '72', nameTh: 'สุพรรณบุรี', nameEn: 'Suphan Buri', lat: 14.4745, lon: 100.1177, region: 'central' },
  '73': { code: '73', nameTh: 'นครปฐม', nameEn: 'Nakhon Pathom', lat: 13.8196, lon: 100.0443, region: 'central' },
  '74': { code: '74', nameTh: 'สมุทรสาคร', nameEn: 'Samut Sakhon', lat: 13.5475, lon: 100.2744, region: 'central' },
  '75': { code: '75', nameTh: 'สมุทรสงคราม', nameEn: 'Samut Songkhram', lat: 13.4098, lon: 99.9997, region: 'central' },
  '76': { code: '76', nameTh: 'เพชรบุรี', nameEn: 'Phetchaburi', lat: 13.1114, lon: 99.9391, region: 'central' },
  '77': { code: '77', nameTh: 'ประจวบคีรีขันธ์', nameEn: 'Prachuap Khiri Khan', lat: 11.8124, lon: 99.7972, region: 'central' },
  '80': { code: '80', nameTh: 'นครศรีธรรมราช', nameEn: 'Nakhon Si Thammarat', lat: 8.4304, lon: 99.9631, region: 'south' },
  '81': { code: '81', nameTh: 'กระบี่', nameEn: 'Krabi', lat: 8.0863, lon: 98.9063, region: 'south' },
  '82': { code: '82', nameTh: 'พังงา', nameEn: 'Phangnga', lat: 8.4501, lon: 98.5255, region: 'south' },
  '83': { code: '83', nameTh: 'ภูเก็ต', nameEn: 'Phuket', lat: 7.8804, lon: 98.3923, region: 'south' },
  '84': { code: '84', nameTh: 'สุราษฎร์ธานี', nameEn: 'Surat Thani', lat: 9.1382, lon: 99.3217, region: 'south' },
  '85': { code: '85', nameTh: 'ระนอง', nameEn: 'Ranong', lat: 9.9658, lon: 98.6348, region: 'south' },
  '86': { code: '86', nameTh: 'ชุมพร', nameEn: 'Chumphon', lat: 10.493, lon: 99.18, region: 'south' },
  '90': { code: '90', nameTh: 'สงขลา', nameEn: 'Songkhla', lat: 7.1756, lon: 100.6143, region: 'south' },
  '91': { code: '91', nameTh: 'สตูล', nameEn: 'Satun', lat: 6.6238, lon: 100.0674, region: 'south' },
  '92': { code: '92', nameTh: 'ตรัง', nameEn: 'Trang', lat: 7.5563, lon: 99.6114, region: 'south' },
  '93': { code: '93', nameTh: 'พัทลุง', nameEn: 'Phatthalung', lat: 7.6166, lon: 100.074, region: 'south' },
  '94': { code: '94', nameTh: 'ปัตตานี', nameEn: 'Pattani', lat: 6.8696, lon: 101.2539, region: 'south' },
  '95': { code: '95', nameTh: 'ยะลา', nameEn: 'Yala', lat: 6.5411, lon: 101.2813, region: 'south' },
  '96': { code: '96', nameTh: 'นราธิวาส', nameEn: 'Narathiwat', lat: 6.4255, lon: 101.8253, region: 'south' },
};

/** Crop Kc coefficients */
export const CROP_CONFIG: Record<string, { nameTh: string; kcInitial: number; kcMid: number; kcEnd: number; note: string }> = {
  rice: { nameTh: 'ข้าวนาปี / ข้าวนาปรัง', kcInitial: 1.05, kcMid: 1.20, kcEnd: 0.90, note: 'ระยะวิกฤต: แตกกอ ตั้งท้อง ออกรวง' },
  sugarcane: { nameTh: 'อ้อยโรงงาน', kcInitial: 0.40, kcMid: 1.25, kcEnd: 0.75, note: 'ระยะวิกฤต: แตกกอและย่างปล้อง' },
  cassava: { nameTh: 'มันสำปะหลัง', kcInitial: 0.35, kcMid: 0.85, kcEnd: 0.35, note: 'ระยะวิกฤต: 1-3 เดือนแรก และสะสมแป้ง' },
  maize: { nameTh: 'ข้าวโพดเลี้ยงสัตว์', kcInitial: 0.35, kcMid: 1.15, kcEnd: 0.55, note: 'ระยะวิกฤต: ออกไหมและผสมเกสร' },
  durian: { nameTh: 'ทุเรียน', kcInitial: 0.70, kcMid: 0.90, kcEnd: 0.75, note: 'ระยะวิกฤต: พัฒนาการผลและขยายผล' },
  oil_palm: { nameTh: 'ปาล์มน้ำมัน', kcInitial: 0.90, kcMid: 1.00, kcEnd: 0.95, note: 'ต้องการน้ำสม่ำเสมอตลอดปี ห้ามแล้งเกิน 2 เดือน' },
  rubber: { nameTh: 'ยางพารา', kcInitial: 0.80, kcMid: 0.95, kcEnd: 0.80, note: 'ระยะวิกฤต: ช่วงผลิใบใหม่หลังผลัดใบ' },
};

/** NOAA / Rothfusz Heat Index calculation */
export function calculateHeatIndex(temperatureC: number, relativeHumidityPct: number): HeatIndexResult {
  if (temperatureC < 20.0) {
    return {
      heatIndexC: Math.round(temperatureC * 10) / 10,
      category: 'normal',
      labelTh: 'ปกติ',
      advisoryTh: 'อุณหภูมิปกติ เหมาะสมกับการเพาะปลูกและปศุสัตว์',
    };
  }

  const tF = temperatureC * 1.8 + 32.0;
  const rh = Math.max(0, Math.min(100, relativeHumidityPct));

  const hiF =
    -42.379 +
    2.04901523 * tF +
    10.14333127 * rh -
    0.22475541 * tF * rh -
    0.00683783 * tF * tF -
    0.05481717 * rh * rh +
    0.00122874 * tF * tF * rh +
    0.00085282 * tF * rh * rh -
    0.00000199 * tF * tF * rh * rh;

  const hiC = Math.round(((hiF - 32.0) * (5.0 / 9.0)) * 10) / 10;

  if (hiC < 27.0) {
    return { heatIndexC: hiC, category: 'normal', labelTh: 'ปกติ', advisoryTh: 'อากาศปกติ ทำงานการเกษตรได้ตามปกติ' };
  } else if (hiC < 32.0) {
    return { heatIndexC: hiC, category: 'caution', labelTh: 'เฝ้าระวัง', advisoryTh: 'อาจเหนื่อยล้าเมื่อทำงานกลางแจ้งเป็นเวลานาน ดื่มน้ำบ่อยขึ้น' };
  } else if (hiC < 41.0) {
    return {
      heatIndexC: hiC,
      category: 'extreme_caution',
      labelTh: 'เตือนภัย',
      advisoryTh: 'ระวังเพลียแดด ตะคริว สัตว์เลี้ยงเริ่มเกิดความเครียดความร้อน ลดการกินอาหาร',
    };
  } else if (hiC < 54.0) {
    return {
      heatIndexC: hiC,
      category: 'danger',
      labelTh: 'อันตราย',
      advisoryTh: 'เสี่ยงโรคลมแดด (Heatstroke) สูง งดทำงานกลางแจ้งช่วงเที่ยง สัตว์เลี้ยงต้องเปิดพัดลม/พ่นละอองน้ำ',
    };
  } else {
    return {
      heatIndexC: hiC,
      category: 'extreme_danger',
      labelTh: 'อันตรายยิ่งยวด',
      advisoryTh: 'อันตรายถึงชีวิต ห้ามทำงานกลางแจ้งเด็ดขาด สัตว์เลี้ยงเสี่ยงต่อการช็อกตาย',
    };
  }
}

/** FAO-56 Crop Water Requirement (ETc = Kc * ET0) */
export function calculateCropWaterRequirement(
  et0Mm: number,
  cropKey = 'rice',
  stage: 'initial' | 'mid' | 'end' = 'mid'
): CropWaterRequirementResult {
  const crop = CROP_CONFIG[cropKey.toLowerCase()] ?? CROP_CONFIG.rice;
  const kc = stage === 'initial' ? crop.kcInitial : stage === 'end' ? crop.kcEnd : crop.kcMid;
  const etcMm = Math.round(et0Mm * kc * 100) / 100;
  const waterVolumeM3PerRai = Math.round(etcMm * 1.6 * 100) / 100;

  return {
    cropKey,
    cropNameTh: crop.nameTh,
    stage,
    kc,
    et0Mm,
    etcMm,
    waterVolumeM3PerRai,
    criticalStageNote: crop.note,
  };
}

/** Simple fast deterministic hash for offline fallback data */
function pseudoHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Deterministic pseudo-realistic offline fallback weather generator */
export function getDeterministicFallbackWeather(
  provinceCode: string,
  startDateStr?: string,
  days = 7
): RawOpenMeteoResponse {
  const province = THAILAND_PROVINCE_CENTROIDS[provinceCode] ?? {
    code: provinceCode,
    nameTh: 'ไม่ระบุ',
    nameEn: 'Unknown',
    lat: 13.75,
    lon: 100.5,
    region: 'central' as const,
  };

  const start = startDateStr ? new Date(startDateStr) : new Date();
  const times: string[] = [];
  const precipitationSum: number[] = [];
  const tempMax: number[] = [];
  const tempMin: number[] = [];
  const tempMean: number[] = [];
  const et0Fao: number[] = [];
  const rhMean: number[] = [];
  const windMax: number[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    times.push(dateStr);

    const h = pseudoHash(`${provinceCode}-${dateStr}-agrimeteo`);
    const month = d.getMonth() + 1;
    const isRainy = month >= 5 && month <= 10;
    const isCool = month === 11 || month === 12 || month === 1;

    let baseMax = 31.0 + (province.lat < 10.0 ? 1.5 : 0.0) + (h % 30) / 10.0;
    if (isCool) baseMax -= 3.0;
    const baseMin = baseMax - (7.0 + (h % 40) / 10.0);
    const baseMean = Math.round(((baseMax + baseMin) / 2) * 10) / 10;

    const rainProb = isRainy ? 65 : isCool ? 20 : 35;
    const rainRoll = (h >> 3) % 100;
    const rain = rainRoll < rainProb ? Math.round(((h % 350) / 10.0) * 10) / 10 : 0.0;
    const et0 = Math.round((3.8 + (baseMax - 28.0) * 0.15 + ((h >> 6) % 15) / 10.0) * 100) / 100;
    const rh = Math.round((65.0 + (isRainy ? 15.0 : 0.0) + ((h >> 9) % 20)) * 10) / 10;
    const wind = Math.round((6.0 + ((h >> 12) % 150) / 10.0) * 10) / 10;

    precipitationSum.push(rain);
    tempMax.push(Math.round(baseMax * 10) / 10);
    tempMin.push(Math.round(baseMin * 10) / 10);
    tempMean.push(baseMean);
    et0Fao.push(et0);
    rhMean.push(rh);
    windMax.push(wind);
  }

  return {
    latitude: province.lat,
    longitude: province.lon,
    elevation: 10,
    generationtime_ms: 0.4,
    utc_offset_seconds: 25200,
    timezone: 'Asia/Bangkok',
    is_fallback: true,
    daily_units: {
      time: 'iso8601',
      precipitation_sum: 'mm',
      temperature_2m_max: '°C',
      temperature_2m_min: '°C',
      temperature_2m_mean: '°C',
      et0_fao_evapotranspiration: 'mm',
      relative_humidity_2m_mean: '%',
      wind_speed_10m_max: 'km/h',
    },
    daily: {
      time: times,
      precipitation_sum: precipitationSum,
      temperature_2m_max: tempMax,
      temperature_2m_min: tempMin,
      temperature_2m_mean: tempMean,
      et0_fao_evapotranspiration: et0Fao,
      relative_humidity_2m_mean: rhMean,
      wind_speed_10m_max: windMax,
    },
  };
}

/** Analyze raw Open-Meteo response into agrometeorological indicators */
export function analyzeProvinceAgroWeather(
  provinceCode: string,
  raw: RawOpenMeteoResponse,
  cropKey = 'rice'
): ProvinceAgroAnalysis {
  const province = THAILAND_PROVINCE_CENTROIDS[provinceCode] ?? {
    code: provinceCode,
    nameTh: 'ไม่ระบุ',
    nameEn: 'Unknown',
    lat: raw.latitude ?? 13.75,
    lon: raw.longitude ?? 100.5,
    region: 'central' as const,
  };

  const times = raw.daily?.time ?? [];
  const precips = raw.daily?.precipitation_sum ?? [];
  const tempMaxs = raw.daily?.temperature_2m_max ?? [];
  const tempMins = raw.daily?.temperature_2m_min ?? [];
  const tempMeans = raw.daily?.temperature_2m_mean ?? [];
  const et0s = raw.daily?.et0_fao_evapotranspiration ?? [];
  const rhs = raw.daily?.relative_humidity_2m_mean ?? [];
  const winds = raw.daily?.wind_speed_10m_max ?? [];

  const dailyRecords: AgroDailyRecord[] = [];
  let totalPrecip = 0;
  let totalEt0 = 0;
  let maxHi = 0;
  let worstStress: HeatIndexCategory = 'normal';

  const severityRank: Record<HeatIndexCategory, number> = {
    normal: 1,
    caution: 2,
    extreme_caution: 3,
    danger: 4,
    extreme_danger: 5,
  };

  for (let i = 0; i < times.length; i++) {
    const p = precips[i] ?? 0;
    const tMax = tempMaxs[i] ?? 32;
    const tMin = tempMins[i] ?? 24;
    const tMean = tempMeans[i] ?? Math.round(((tMax + tMin) / 2) * 10) / 10;
    const et0 = et0s[i] ?? 4.0;
    const rh = rhs[i] ?? 70;
    const wind = winds[i] ?? 8;

    totalPrecip += p;
    totalEt0 += et0;

    const hi = calculateHeatIndex(tMax, rh);
    if (hi.heatIndexC > maxHi) maxHi = hi.heatIndexC;
    if (severityRank[hi.category] > severityRank[worstStress]) {
      worstStress = hi.category;
    }

    const waterBalance = Math.round((p - et0) * 100) / 100;
    const cropReq = calculateCropWaterRequirement(et0, cropKey);

    dailyRecords.push({
      date: times[i],
      precipitationMm: p,
      tempMaxC: tMax,
      tempMinC: tMin,
      tempMeanC: tMean,
      et0FaoMm: et0,
      relativeHumidityPct: rh,
      windSpeedMaxKmh: wind,
      heatIndexC: hi.heatIndexC,
      heatIndexCategory: hi.category,
      heatIndexLabelTh: hi.labelTh,
      waterBalanceMm: waterBalance,
      cropWaterNeedMm: cropReq.etcMm,
      cropWaterDeficitMm: Math.round((p - cropReq.etcMm) * 100) / 100,
    });
  }

  const daysCount = Math.max(1, dailyRecords.length);
  const avgEt0 = Math.round((totalEt0 / daysCount) * 100) / 100;
  totalPrecip = Math.round(totalPrecip * 100) / 100;
  totalEt0 = Math.round(totalEt0 * 100) / 100;
  const netWaterBalance = Math.round((totalPrecip - totalEt0) * 100) / 100;

  let moistureStatus: AgroPeriodSummary['moistureStatus'] = 'balanced';
  let moistureLabelTh = 'สมดุลน้ำปกติ (ความชื้นเหมาะสมต่อพืช)';

  if (netWaterBalance < -25) {
    moistureStatus = 'severe_water_deficit';
    moistureLabelTh = 'ขาดดุลน้ำรุนแรง (ต้องให้น้ำชลประทานเสริม)';
  } else if (netWaterBalance < -10) {
    moistureStatus = 'moderate_water_deficit';
    moistureLabelTh = 'ขาดดุลน้ำปานกลาง (ดินเริ่มสูญเสียความชื้น)';
  } else if (netWaterBalance > 15) {
    moistureStatus = 'water_surplus';
    moistureLabelTh = 'น้ำเกินดุล (เสี่ยงน้ำท่วมขังหรือดินแฉะ)';
  }

  return {
    provinceCode: province.code,
    provinceNameTh: province.nameTh,
    provinceNameEn: province.nameEn,
    region: province.region,
    coordinates: { lat: province.lat, lon: province.lon },
    cropEvaluated: cropKey,
    periodSummary: {
      days: daysCount,
      totalPrecipitationMm: totalPrecip,
      totalEt0Mm: totalEt0,
      avgDailyEt0Mm: avgEt0,
      netWaterBalanceMm: netWaterBalance,
      moistureStatus,
      moistureLabelTh,
      maxHeatIndexC: maxHi,
      worstHeatStressLevel: worstStress,
    },
    dailyRecords,
    metadata: {
      source: 'Open-Meteo',
      attribution: OPEN_METEO_ATTRIBUTION,
      sourceUrl: OPEN_METEO_URL,
      license: OPEN_METEO_LICENSE,
      spatialSupport: OPEN_METEO_SPATIAL_SUPPORT,
      gridResolution: OPEN_METEO_GRID_RESOLUTION,
      isFallback: !!raw.is_fallback,
      note: 'Grid Point estimation based on province centroid, NOT TMD ground station observation',
    },
  };
}

/** Fetch weather for a single province with automatic fallback */
export async function fetchProvinceWeather(
  provinceCode: string,
  options: {
    mode?: 'forecast' | 'archive';
    days?: number;
    startDate?: string;
    endDate?: string;
    fetcher?: typeof fetch;
  } = {}
): Promise<RawOpenMeteoResponse> {
  const province = THAILAND_PROVINCE_CENTROIDS[provinceCode];
  if (!province) {
    return getDeterministicFallbackWeather(provinceCode, options.startDate, options.days ?? 7);
  }

  const mode = options.mode ?? 'forecast';
  const days = Math.min(14, Math.max(1, options.days ?? 7));
  const fetchFn = options.fetcher ?? fetch;

  const endpoint = mode === 'forecast' ? OPEN_METEO_FORECAST_API : OPEN_METEO_ARCHIVE_API;
  const params = new URLSearchParams({
    latitude: province.lat.toString(),
    longitude: province.lon.toString(),
    daily: [
      'precipitation_sum',
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'et0_fao_evapotranspiration',
      'relative_humidity_2m_mean',
      'wind_speed_10m_max',
    ].join(','),
    timezone: 'Asia/Bangkok',
  });

  if (mode === 'forecast') {
    params.set('forecast_days', days.toString());
  } else {
    const today = new Date();
    const end = options.endDate ?? today.toISOString().slice(0, 10);
    const startObj = new Date(today);
    startObj.setDate(startObj.getDate() - days);
    const start = options.startDate ?? startObj.toISOString().slice(0, 10);
    params.set('start_date', start);
    params.set('end_date', end);
    params.set('models', 'era5');
  }

  const url = `${endpoint}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ThailandAgriHub/1.0 (Agrometeorology Engine)' },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return getDeterministicFallbackWeather(provinceCode, options.startDate, days);
    }

    const data = (await res.json()) as RawOpenMeteoResponse;
    data.is_fallback = false;
    return data;
  } catch {
    return getDeterministicFallbackWeather(provinceCode, options.startDate, days);
  }
}

/** Batch-fetch weather for multiple provinces */
export async function fetchMultiProvinceWeather(
  provinceCodes: string[],
  options: {
    mode?: 'forecast' | 'archive';
    days?: number;
    startDate?: string;
    endDate?: string;
    fetcher?: typeof fetch;
  } = {}
): Promise<Record<string, RawOpenMeteoResponse>> {
  const results: Record<string, RawOpenMeteoResponse> = {};
  const validProvinces = provinceCodes
    .map((code) => THAILAND_PROVINCE_CENTROIDS[code])
    .filter((p): p is ProvinceCentroid => Boolean(p));

  if (validProvinces.length === 0) return results;

  // Query in chunks of up to 10
  const chunkSize = 10;
  for (let i = 0; i < validProvinces.length; i += chunkSize) {
    const chunk = validProvinces.slice(i, i + chunkSize);
    const lats = chunk.map((p) => p.lat).join(',');
    const lons = chunk.map((p) => p.lon).join(',');

    const endpoint = options.mode === 'archive' ? OPEN_METEO_ARCHIVE_API : OPEN_METEO_FORECAST_API;
    const days = Math.min(14, Math.max(1, options.days ?? 7));
    const params = new URLSearchParams({
      latitude: lats,
      longitude: lons,
      daily: [
        'precipitation_sum',
        'temperature_2m_max',
        'temperature_2m_min',
        'temperature_2m_mean',
        'et0_fao_evapotranspiration',
        'relative_humidity_2m_mean',
        'wind_speed_10m_max',
      ].join(','),
      timezone: 'Asia/Bangkok',
    });

    if (options.mode === 'archive') {
      const today = new Date();
      params.set('start_date', options.startDate ?? today.toISOString().slice(0, 10));
      params.set('end_date', options.endDate ?? today.toISOString().slice(0, 10));
      params.set('models', 'era5');
    } else {
      params.set('forecast_days', days.toString());
    }

    try {
      const fetchFn = options.fetcher ?? fetch;
      const res = await fetchFn(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        chunk.forEach((p, idx) => {
          results[p.code] = { ...(data[idx] ?? {}), is_fallback: false };
        });
      } else if (chunk.length === 1 && typeof data === 'object') {
        results[chunk[0].code] = { ...data, is_fallback: false };
      } else {
        throw new Error('Unexpected payload structure');
      }
    } catch {
      // Chunk fallback
      chunk.forEach((p) => {
        results[p.code] = getDeterministicFallbackWeather(p.code, options.startDate, days);
      });
    }
  }

  return results;
}
