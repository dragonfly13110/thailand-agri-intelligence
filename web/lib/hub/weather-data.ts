import 'server-only';
import { HubRequestError, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import { getProvinces } from '../provinces';

export type RegionKey = 'north' | 'northeast' | 'central' | 'east' | 'south';

export const REGIONS: { key: RegionKey; label: string }[] = [
  { key: 'north', label: 'ภาคเหนือ' },
  { key: 'northeast', label: 'ภาคตะวันออกเฉียงเหนือ' },
  { key: 'central', label: 'ภาคกลาง' },
  { key: 'east', label: 'ภาคตะวันออก' },
  { key: 'south', label: 'ภาคใต้' },
];

const REGION_LABEL = Object.fromEntries(REGIONS.map(({ key, label }) => [key, label])) as Record<RegionKey, string>;

/** Reference grouping only; it never claims forecast coverage. */
export const REGION_BY_PROVINCE: Record<string, RegionKey> = {
  '10': 'central', '11': 'central', '12': 'central', '13': 'central', '14': 'central',
  '15': 'central', '16': 'central', '17': 'central', '18': 'central', '19': 'central',
  '70': 'central', '71': 'central', '72': 'central', '73': 'central', '74': 'central',
  '75': 'central', '76': 'central', '77': 'central',
  '20': 'east', '21': 'east', '22': 'east', '23': 'east',
  '24': 'east', '25': 'east', '26': 'east', '27': 'east',
  '30': 'northeast', '31': 'northeast', '32': 'northeast', '33': 'northeast',
  '34': 'northeast', '35': 'northeast', '36': 'northeast', '37': 'northeast',
  '38': 'northeast', '39': 'northeast', '40': 'northeast', '41': 'northeast',
  '42': 'northeast', '43': 'northeast', '44': 'northeast', '45': 'northeast',
  '46': 'northeast', '47': 'northeast', '48': 'northeast', '49': 'northeast',
  '50': 'north', '51': 'north', '52': 'north', '53': 'north', '54': 'north',
  '55': 'north', '56': 'north', '57': 'north', '58': 'north',
  '60': 'north', '61': 'north', '62': 'north', '63': 'north', '64': 'north',
  '65': 'north', '66': 'north', '67': 'north',
  '80': 'south', '81': 'south', '82': 'south', '83': 'south', '84': 'south',
  '85': 'south', '86': 'south',
  '90': 'south', '91': 'south', '92': 'south', '93': 'south', '94': 'south',
  '95': 'south', '96': 'south',
};

export const FORECAST_UNITS: Record<string, string> = {
  temperature: 'celsius',
  rain_chance: 'percent',
  rainfall: 'mm',
  relative_humidity: 'percent',
  wind_speed: 'm/s',
  wind_direction: 'degrees_compass',
};

export const SOURCE = {
  agency: 'กรมอุตุนิยมวิทยา (TMD)',
  sourceUrl: 'https://www.tmd.go.th/th',
  licenseStatus: 'pending',
} as const;

export const WEATHER_WARNINGS = [
  'ยังไม่มีข้อมูลพยากรณ์ที่ได้รับอนุมัติให้เผยแพร่ จึงไม่แสดงตัวเลขตัวอย่าง',
  'พยากรณ์ TMD HPC อยู่ที่ /nwp และใช้คนละชุดข้อมูลกับหน้านี้',
  'ค่าตรวจวัดรายสถานีแยกอยู่ที่ /api/v1/weather/observations ไม่ใช่ค่าพยากรณ์',
];

export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'shower' | 'heavy_rain' | 'thunderstorm';
export type AdvisorySeverity = 'high' | 'medium' | 'low';

export type ForecastDay = {
  date: string;
  weekdayTh: string;
  dateLabelTh: string;
  conditionCode: WeatherCondition;
  conditionLabelTh: string;
  rainChancePercent: number | null;
  rainfallMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  humidityMinPercent: number | null;
  humidityMaxPercent: number | null;
  windDirectionDeg: number | null;
  windDirectionLabelTh: string | null;
  windSpeedMs: number | null;
  sample: boolean;
};

export type CumulativeRainfall = {
  windowDays: number;
  daysWithData: number;
  missingDays: number;
  forecastTotalMm: number | null;
  normalTotalMm: number;
  anomalyMm: number | null;
  anomalyPercent: number | null;
  status: 'below_normal' | 'normal' | 'above_normal' | 'unknown';
  completeness: 'complete' | 'partial';
  dryDays: number;
  heavyRainDays: number;
  byDay: { date: string; rainfallMm: number | null; normalMm: number; forecastCumulativeMm: number | null; normalCumulativeMm: number }[];
  calculationVersion: string;
};

export type Advisory = {
  code: string;
  severity: AdvisorySeverity;
  titleTh: string;
  messageTh: string;
  actions: string[];
};

export type WeatherOverview = {
  location: { kind: 'province' | 'region'; code: string; name: string; region: RegionKey; regionLabel: string };
  issuedAt: string | null;
  dataKind: 'unavailable';
  sample: false;
  source: typeof SOURCE;
  units: Record<string, string>;
  days: ForecastDay[];
  cumulative: CumulativeRainfall | null;
  advisories: Advisory[];
};

function isRegionKey(value: string): value is RegionKey {
  return REGIONS.some((region) => region.key === value);
}

export async function buildWeatherOverview(url: URL): Promise<WeatherOverview> {
  const provinceCode = parseText(url, 'provinceCode', 2);
  const regionParam = parseText(url, 'region', 20);
  let kind: 'province' | 'region';
  let code: string;
  let name: string;
  let region: RegionKey;

  if (provinceCode) {
    if (!/^\d{2}$/.test(provinceCode) || !await isSupportedProvinceCode(provinceCode)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
    }
    kind = 'province';
    code = provinceCode;
    region = REGION_BY_PROVINCE[provinceCode];
    const provinces = await getProvinces();
    name = provinces.find((row) => row.code === provinceCode)?.name ?? provinceCode;
  } else if (regionParam) {
    if (!isRegionKey(regionParam)) throw new HubRequestError(400, 'INVALID_QUERY', 'ภาคที่ระบุไม่ถูกต้อง');
    kind = 'region';
    code = regionParam;
    region = regionParam;
    name = REGION_LABEL[regionParam];
  } else {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ต้องระบุ provinceCode หรือ region');
  }

  return {
    location: { kind, code, name, region, regionLabel: REGION_LABEL[region] },
    issuedAt: null,
    dataKind: 'unavailable',
    sample: false,
    source: SOURCE,
    units: FORECAST_UNITS,
    days: [],
    cumulative: null,
    advisories: [],
  };
}
