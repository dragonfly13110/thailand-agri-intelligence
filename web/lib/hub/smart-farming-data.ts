import 'server-only';
import { getProvinces } from '../provinces';
import { REGION_BY_PROVINCE, REGIONS } from './weather-data';
import type { RegionKey } from './weather-data';

/**
 * เกษตรอัจฉริยะและเซนเซอร์ IoT (Smart Farming & Agri-IoT)
 * สำหรับหน้า /smart-farming และ /api/v1/smart-farming
 *
 * กติกาสิทธิ์ (AGENTS.md ข้อ 3–4 + precedent ของ lane ปศุสัตว์/สภาพอากาศ):
 * - ไม่มีการเรียก MQTT broker, LoRaWAN network server, SCADA ของเขตชลประทาน หรือ API ผู้ขายเซนเซอร์
 *   ในไฟล์นี้เลย ทุกค่าจึงเป็น "ค่าตัวอย่างแบบ deterministic" ที่สังเคราะห์จาก seed คีย์คงที่
 *   และตั้ง `sample: true` + `access: 'metadata_only'` ไว้ทั้ง payload และ meta ของ API
 * - ชื่อหน่วยงาน เจ้าของแปลง และ URL ใน `sources` เป็น "รูปแบบสถาบันจริง" เพื่อสาธิตสถาปัตยกรรมข้อมูล
 *   ไม่ใช่หลักฐานว่า Hub ได้รับ feed เกษตรอัจฉริยะจากหน่วยงานนั้น
 * - เมื่อต่อ gateway จริง ให้คง type contract ชุดนี้ไว้ เปลี่ยนเฉพาะแหล่งค่า (value/status/firmware)
 *   ห้ามเปลี่ยนชื่อฟิลด์ที่หน้าจอกำลังใช้อยู่ และห้ามใส่ค่า 0 แทนค่าที่วัดไม่ได้ (ต้องเป็น null)
 *
 * กติกาความน่าเชื่อถือของตัวเลข:
 * - ห้าม Math.random() และ Date.now() ในเส้นทางที่สร้างค่า ตัวเลขมาจาก mulberry32 + FNV-1a
 *   (seedFrom) เหมือน livestock-data.ts และ weather-data.ts ทุก field ทำซ้ำได้
 * - "เวลาปัจจุบัน" ของแบบจำลองคือ SMART_FARMING_GOVERNANCE.updatedAt (ค่าคงที่) และ
 *   generatedAt คือค่าคงที่ตัวนี้ response จึง byte-stable ทุก request/ทุก build
 * - grain ของแต่ละค่าต้องคงไว้: %VWC = ค่าที่ระดับความลึกของโพรบ, มม. = ปริมาณต่อพื้นที่,
 *   ppm = ค่าจากโพรบในแปลง ไม่ใช่ค่ารายกริดหรือรายจังหวัด และไม่ใช่ค่าเฉลี่ยของทั้งอำเภอ
 * - รายชื่อ 77 จังหวัดคือ "กลุ่มอ้างอิงตามทะเบียนจังหวัด" ไม่ใช่ข้อสรุปว่าครอบคลุมพื้นที่จริง
 *   บอกซ้ำทั้งใน warnings, summary.coverageNote และ gaps
 *
 * รูปแบบ seed key (ใช้ format นี้เวลา debug ค่าให้ตรงกับหน้าจอ):
 * - `sf:profile:{provinceCode}:{index}|{field}`  → พืช/เนื้อดิน/ระบบน้ำ/อำเภอ/พื้นที่/หน่วยงาน
 * - `sf:plant:{farmId}|age|day`                  → วันปลูกและระยะเจริญเติบโต
 * - `sf:rain:{farmId}|chance|start|duration|peak`→ แผนฝน 24 ชั่วโมง
 * - `sf:hour:{farmId}|mean|amp|cloud|peakLux` และ `sf:hour:{farmId}:{hour}:{metric}` → ไมโครไคลเมต
 * - `sf:soil:{farmId}` → ตำแหน่งความชื้นในช่วง WP→FC, `|deep` → ชั้นลึกรอง,
 *   `|saturated` → ช่วงอิ่มตัวหลังฝนหนัก, `|dry-spot` + `|dry-gauge` → แปลงแห้งจัด/วิกฤต
 * - `sf:npk:{farmId}|n|p|k`                      → ppm รายธาตุ
 * - `sf:flow:{farmId}`                            → อัตราไหลอ้างอิงของมิเตอร์
 * - `sf:sensor:{nodeId}:status|battery|stale|hour|firmware` → telemetry รายโหนด
 * - `sf:plotname:{...}`                           → ชื่อแปลงเอกชน/สหกรณ์
 */

/* ------------------------------------------------------------------ */
/* ประเภทตามสัญญาข้อมูล (export contract ของ lane 4A)                  */
/* ------------------------------------------------------------------ */

export type SensorStatus = 'online' | 'offline' | 'low_battery' | 'maintenance';
export type MoistureStatus = 'saturated' | 'adequate' | 'watch' | 'deficit' | 'critical';
export type IrrigationPriority = 'now' | 'today' | 'scheduled' | 'skip';
export type SensorKind =
  | 'soil_moisture' | 'air_temperature' | 'relative_humidity'
  | 'par_light' | 'npk' | 'water_flow' | 'rainfall';

export interface SmartFarmingGovernance {
  sample: true;
  access: 'metadata_only';
  version: string;
  bannerText: string;
  disclaimer: string;
  updatedAt: string;
}

export const SMART_FARMING_GOVERNANCE: SmartFarmingGovernance = {
  sample: true,
  access: 'metadata_only',
  version: 'smart-farming-iot-sim-2026.10-v1',
  bannerText:
    'ข้อมูลเกษตรอัจฉริยะและเซนเซอร์ IoT ชุดนี้เป็นค่าตัวอย่างแบบ deterministic (Demo/Sample) ไม่ใช่ค่า telemetry จากพื้นที่จริง',
  disclaimer:
    'ค่าความชื้นดิน (หน่วย %VWC) ไมโครไคลเมตระดับทรงพุ่ม NPK โพรบ และสถานะเครือข่ายเซนเซอร์ในชุดนี้ สร้างจากแบบจำลอง deterministic ที่ตั้งอยู่บนนิยามทาง agronomy ของจุดแห้งตายถาวร (permanent wilting point) และจุดความจุความชื้นภาคสนาม (field capacity) ต่อชนิดเนื้อดินและรายพืช เพื่อสาธิตสถาปัตยกรรมข้อมูลของ Thailand Agricultural Data Hub ยังไม่มีการเชื่อม LoRaWAN gateway หรือ MQTT broker ใด ๆ ห้ามใช้กำหนดรอบน้ำจริง กำหนดปุ๋ยจริง หรืออ้างอิงเป็นสถิติต่อสาธารณะ ตัวเลขจะเปลี่ยนเป็นค่าจริงได้ก็ต่อเมื่อ resource ผ่านการตรวจสิทธิ์ใน config/resource_licenses.json แล้วเท่านั้น',
  updatedAt: '2026-10-25T08:00:00+07:00',
};

export interface SensorNode {
  nodeId: string;
  farmId: string;
  provinceCode: string;
  kind: SensorKind;
  label: string;
  status: SensorStatus;
  batteryPercent: number;
  lastSeenAt: string;
  firmware: string;
  value: number | null;
  unit: string;
  lowThreshold: number | null;
  highThreshold: number | null;
}

export interface MicroclimateHour {
  hourLabel: string;
  time: string;
  airTempC: number;
  humidityPercent: number;
  soilMoisturePercent: number;
  lightKlux: number;
  rainfallMm: number;
  windSpeedMs: number;
  et0Mm: number;
}

export interface NextIrrigationWindow {
  priority: IrrigationPriority;
  from: string;
  to: string;
  label: string;
  reason: string;
  recommendedMinutes: number;
  recommendedWaterMm: number;
}

export interface NpkReading {
  nitrogenPpm: number;
  phosphorusPpm: number;
  potassiumPpm: number;
  level: 'low' | 'optimal' | 'high';
  advice: string;
}

export interface FarmPlot {
  farmId: string;
  farmName: string;
  provinceCode: string;
  provinceName: string;
  regionKey: RegionKey;
  regionLabel: string;
  districtLabel: string;
  farmType: 'government_demo' | 'cooperative' | 'private_demo';
  ownerAgency: string;
  cropId: string;
  cropName: string;
  plantDate: string;
  growthStage: string;
  areaRai: number;
  soilTexture: string;
  irrigationSystem: string;
  sensorTotal: number;
  sensorOnline: number;
  sensorOffline: number;
  lowBatteryCount: number;
  soilMoisturePercent: number;
  fieldCapacityPercent: number;
  wiltingPointPercent: number;
  availableWaterPercent: number;
  moistureStatus: MoistureStatus;
  moistureGaugePercent: number;
  et0TodayMm: number;
  npk: NpkReading;
  nextIrrigation: NextIrrigationWindow;
  sensors: SensorNode[];
  microclimate: MicroclimateHour[];
}

export interface SmartFarmingSummary {
  totalFarms: number;
  totalProvinces: number;
  totalSensors: number;
  onlineSensors: number;
  offlineSensors: number;
  lowBatterySensors: number;
  avgSoilMoisturePercent: number;
  avgAirTempC: number;
  avgEt0Mm: number;
  farmsNeedIrrigationNow: number;
  farmsIrrigationToday: number;
  farmsSkipIrrigation: number;
  totalAreaRai: number;
  coverageNote: string;
  headline: string;
  subheadline: string;
  sample: true;
  reportDate: string;
}

export interface SmartFarmingProvinceOption {
  code: string;
  name: string;
  regionKey: RegionKey;
  regionLabel: string;
  farmCount: number;
}

export interface SmartFarmingCropOption {
  id: string;
  name: string;
  farmCount: number;
}

export interface SmartFarmingSourceRef {
  id: string;
  name: string;
  url: string | null;
  note: string;
  access: 'metadata_only';
}

export interface SmartFarmingGap {
  title: string;
  detail: string;
}

export interface SmartFarmingDashboardPayload {
  generatedAt: string;
  sample: true;
  access: 'metadata_only';
  bannerText: string;
  disclaimer: string;
  summary: SmartFarmingSummary;
  farms: FarmPlot[];
  provinces: SmartFarmingProvinceOption[];
  crops: SmartFarmingCropOption[];
  sources: SmartFarmingSourceRef[];
  warnings: string[];
  gaps: SmartFarmingGap[];
}

export type FarmFilterOptions = {
  provinceCode?: string;
  cropId?: string;
  moistureStatus?: MoistureStatus;
  sensorState?: 'all' | 'online' | 'offline' | 'low_battery';
  query?: string;
};

/* ------------------------------------------------------------------ */
/* วันอ้างอิงของแบบจำลอง (ค่าคงที่ ห้ามสลับไปใช้ clock จริง)             */
/* ------------------------------------------------------------------ */

const REPORT_YEAR = 2026;
const REPORT_MONTH = 10;
const REPORT_DAY = 25;
const REPORT_DATE = '2026-10-25';
/** "เวลาปัจจุบัน" ของโมเดล = 25 ต.ค. 2569 08:00 น. นับเป็นนาทีจาก 00:00+07:00 ของวันเดียวกัน */
const SIM_NOW_MINUTES = 8 * 60;

/**
 * แปลงจำนวนนาทีนับจาก 25 ต.ค. 2569 00:00 น. (เวลากรุงเทพ) เป็น ISO ที่ระบุ +07:00
 * ใช้ Date.UTC กับค่าคงที่เท่านั้น จึงให้ผลเหมือนเดิมทุกครั้ง
 */
function isoAtBangkok(minutesAfterMidnight: number): string {
  const shifted = new Date(Date.UTC(REPORT_YEAR, REPORT_MONTH - 1, REPORT_DAY) + minutesAfterMidnight * 60_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
    + `T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:00+07:00`;
}

/** นาฬิกาแสดงแบบ HH:mm (เวลากรุงเทพ รองรับค่าเกิน 24 ชม. ด้วยการมอดูโล) */
function clockLabel(minutesAfterMidnight: number): string {
  const wrapped = ((minutesAfterMidnight % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function civilDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysBetweenCivil(fromDate: string, toDate: string): number {
  return Math.floor((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* ตัวช่วย deterministic (แบบเดียวกับ livestock-data.ts)                */
/* ------------------------------------------------------------------ */

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

function draw(key: string): number {
  return mulberry32(seedFrom(key))();
}

function between(key: string, min: number, max: number): number {
  return min + draw(key) * (max - min);
}

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

/* ------------------------------------------------------------------ */
/* นิยามทาง agronomy: เนื้อดิน ค่า FC/WP                                */
/* ------------------------------------------------------------------ */

interface SoilTextureDef {
  label: string;
  fieldCapacityPercent: number;
  wiltingPointPercent: number;
}

/**
 * ค่า FC/WP เป็น "ค่าเริ่มต้นทาง agronomy ต่อเนื้อดิน" ตามชั้นดินเกษตรทั่วไป
 * ไม่ใช่ค่าที่สอบเทียบหน้าแปลงด้วยวิธี gravimetric (ดู warnings ข้อ 4)
 */
const SOIL_TEXTURES: SoilTextureDef[] = [
  { label: 'ดินเหนียว', fieldCapacityPercent: 34.0, wiltingPointPercent: 18.0 },
  { label: 'ดินร่วนเหนียว', fieldCapacityPercent: 30.0, wiltingPointPercent: 14.0 },
  { label: 'ดินร่วน', fieldCapacityPercent: 26.5, wiltingPointPercent: 11.5 },
  { label: 'ดินร่วนปนทรายแป้ง', fieldCapacityPercent: 28.5, wiltingPointPercent: 12.5 },
  { label: 'ดินร่วนปนทราย', fieldCapacityPercent: 20.5, wiltingPointPercent: 8.0 },
  { label: 'ดินทรายปนดินร่วน', fieldCapacityPercent: 17.0, wiltingPointPercent: 5.5 },
];

/** ดัชนี SOIL_TEXTURES ที่พบบ่อยตามภาค (กลุ่มอ้างอิง ไม่ใช่ผลสำรวจดินรายหลุม) */
const TEXTURE_POOL: Record<RegionKey, number[]> = {
  north: [1, 2, 3, 4],
  northeast: [2, 4, 5, 1, 4],
  central: [0, 1, 2, 3],
  east: [2, 4, 1, 4],
  south: [4, 2, 1, 3],
};

/* ------------------------------------------------------------------ */
/* ระบบน้ำ: อัตราการให้น้ำ (มม./ชม.) และอัตราไหลอ้างอิง (ลิตร/นาที)      */
/* ------------------------------------------------------------------ */

interface IrrigationDef {
  label: string;
  applicationRateMmPerHour: number;
  referenceFlowLpm: number;
  /** ระบบแรงดันมีมิเตอร์วัดการไหลในแปลง จึงติดตั้งโหนด water_flow */
  pressurized: boolean;
}

const IRRIGATION_SYSTEMS: IrrigationDef[] = [
  { label: 'น้ำหยด', applicationRateMmPerHour: 8, referenceFlowLpm: 24, pressurized: true },
  { label: 'สปริงเกอร์', applicationRateMmPerHour: 15, referenceFlowLpm: 46, pressurized: true },
  { label: 'ระบบน้ำหมอก', applicationRateMmPerHour: 6, referenceFlowLpm: 18, pressurized: true },
  { label: 'ร่อง (furrow)', applicationRateMmPerHour: 30, referenceFlowLpm: 92, pressurized: false },
  { label: 'ระบบสวน (mound/furrow)', applicationRateMmPerHour: 22, referenceFlowLpm: 68, pressurized: false },
  { label: 'นาขังสลับแห้ง (AWD)', applicationRateMmPerHour: 25, referenceFlowLpm: 110, pressurized: false },
];

/* ------------------------------------------------------------------ */
/* ปฏิทินพืช ระยะเจริญเติบโต และเกณฑ์การให้น้ำรายพืช                    */
/* ------------------------------------------------------------------ */

interface GrowthWindow {
  fromDays: number;
  toDays: number;
  label: string;
}

interface CropDef {
  id: string;
  name: string;
  regions: RegionKey[];
  /** ความลึกเขตรากที่ใช้คิดสมดุลน้ำ (มม.) */
  rootDepthMm: number;
  /** ปรับ FC/WP ของเนื้อดินตามลักษณะทรงพุ่มและเขตรากของพืช (หน่วย: เปอร์เซ็นต์ของค่าฐาน) */
  fcBias: number;
  wpBias: number;
  /** เติมความชื้นกลับไปถึงตำแหน่ง gauge นี้ (%) */
  targetGaugePercent: number;
  /** เกณฑ์ที่พืชเริ่มเครียด (ต่ำกว่านี้ = deficit) */
  stressGaugePercent: number;
  /** เกณฑ์วิกฤต (ต่ำกว่านี้ = critical) */
  criticalGaugePercent: number;
  /** ฝน 24 ชม. ที่ถือว่า "ฝนทดแทนรอบให้น้ำแล้ว" (มม.) */
  rainSkipMm: number;
  /** เพดานน้ำต่อรอบที่ไม่ควรเกิน (มม.) */
  maxEventWaterMm: number;
  /** ค่าสัมประสิทธิ์พืช (crop coefficient) ใช้คิดการสูญน้ำจริง */
  cropCoefficient: number;
  areaBandRai: [number, number];
  /** พืชปีเดียวปลูกในฤดูเดียวกับวันอ้างอิง / ไม้ผล-ไม้ยืนต้นปลูกย้อนหลายปี */
  perennial: boolean;
  plantMonth: number;
  plantDayFrom: number;
  plantDayTo: number;
  /** ปีปลูกแรกที่ไม้ยืนต้นรุ่นเก่าที่สุดในโมเดลลงไว้ */
  perennialStartYear: number;
  /** จำนวนช่วงอายุ (ปี) ที่สุ่มได้ สำหรับไม้ยืนต้น */
  perennialAgeBands: number;
  growthWindows: GrowthWindow[];
  fertilizerFormula: string;
  /** ดัชนี IRRIGATION_SYSTEMS ที่ใช้กับพืชนั้น */
  irrigationPool: number[];
}

const CROPS: CropDef[] = [
  {
    id: 'rice_wet', name: 'ข้าวนาปี', regions: ['central', 'north', 'northeast', 'east'],
    rootDepthMm: 300, fcBias: 0.4, wpBias: -0.3,
    targetGaugePercent: 86, stressGaugePercent: 42, criticalGaugePercent: 24,
    rainSkipMm: 18, maxEventWaterMm: 28, cropCoefficient: 1.10, areaBandRai: [15, 240],
    perennial: false, plantMonth: 6, plantDayFrom: 8, plantDayTo: 27,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 24, label: 'ระยะแตกกอ' },
      { fromDays: 25, toDays: 49, label: 'ระยะตั้งท้อง' },
      { fromDays: 50, toDays: 69, label: 'ระยะออกรวง' },
      { fromDays: 70, toDays: 94, label: 'ระยะน้ำนม' },
      { fromDays: 95, toDays: 104, label: 'ระยะเก็บเกี่ยว' },
      { fromDays: 105, toDays: 4000, label: 'ค้างเก็บเกี่ยว (เกินช่วงอายุข้าว 95–104 วัน ต้องตรวจแปลง)' },
    ],
    fertilizerFormula: '46-0-0 แบ่ง 2 รอบ ร่วมกับ 18-46-0 ระยะตั้งท้อง',
    irrigationPool: [5, 3, 1],
  },
  {
    id: 'rice_dry', name: 'ข้าวนาปรัง', regions: ['central', 'north'],
    rootDepthMm: 300, fcBias: 0.4, wpBias: -0.3,
    targetGaugePercent: 88, stressGaugePercent: 45, criticalGaugePercent: 26,
    rainSkipMm: 14, maxEventWaterMm: 30, cropCoefficient: 1.15, areaBandRai: [12, 180],
    perennial: false, plantMonth: 11, plantDayFrom: 5, plantDayTo: 26,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 19, label: 'ยังไม่ถึงรอบปลูกนาปรัง (เดือน พ.ย.–ธ.ค.)' },
      { fromDays: 20, toDays: 44, label: 'ระยะแตกกอ' },
      { fromDays: 45, toDays: 69, label: 'ระยะตั้งท้อง–ออกรวง' },
      { fromDays: 70, toDays: 94, label: 'ระยะน้ำนม' },
      { fromDays: 95, toDays: 4000, label: 'ระยะเก็บเกี่ยว' },
    ],
    fertilizerFormula: '46-0-0 อัตรา 8–10 กก./ไร่ แบ่ง 2 ครั้ง ตามคำแนะนำกรมการข้าว',
    irrigationPool: [5, 3],
  },
  {
    id: 'sugarcane', name: 'อ้อยโรงงาน', regions: ['central', 'northeast', 'north'],
    rootDepthMm: 700, fcBias: -0.6, wpBias: 0.4,
    targetGaugePercent: 78, stressGaugePercent: 40, criticalGaugePercent: 22,
    rainSkipMm: 20, maxEventWaterMm: 32, cropCoefficient: 1.00, areaBandRai: [25, 420],
    perennial: false, plantMonth: 12, plantDayFrom: 4, plantDayTo: 25,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 29, label: 'ยังไม่ถึงรอบปลูก (เดือน ธ.ค.–ม.ค.)' },
      { fromDays: 30, toDays: 89, label: 'ระยะงอก–เริ่มแตกกอ' },
      { fromDays: 90, toDays: 179, label: 'ระยะแตกกอสูงเร็ว' },
      { fromDays: 180, toDays: 269, label: 'ระยะยืดปล้อง' },
      { fromDays: 270, toDays: 4000, label: 'ระยะแก่–เตรียมเก็บเกี่ยว (อ้อยข้ามแล้ง)' },
    ],
    fertilizerFormula: '21-0-0 หรือ 15-15-15 โรยข้างแถวแล้วพรวนกลบ หลังงอก 30 วัน',
    irrigationPool: [3, 1, 0],
  },
  {
    id: 'cassava', name: 'มันสำปะหลัง', regions: ['northeast', 'central', 'east', 'north'],
    rootDepthMm: 800, fcBias: -1.2, wpBias: 0.6,
    targetGaugePercent: 72, stressGaugePercent: 36, criticalGaugePercent: 20,
    rainSkipMm: 22, maxEventWaterMm: 30, cropCoefficient: 0.95, areaBandRai: [20, 380],
    perennial: false, plantMonth: 1, plantDayFrom: 5, plantDayTo: 28,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 269, label: 'รอรอบปลูกต้นฤดูฝน (ปลูก ม.ค.–ก.พ.)' },
      { fromDays: 270, toDays: 329, label: 'ระยะตั้งตัว' },
      { fromDays: 330, toDays: 389, label: 'ระยะลงหัว' },
      { fromDays: 390, toDays: 449, label: 'ระยะสะสมอาหารในหัว' },
      { fromDays: 450, toDays: 4000, label: 'ระยะเก็บเกี่ยวหัว อายุ 10–12 เดือน' },
    ],
    fertilizerFormula: '14-14-21 หรือ 13-13-21 อัตรา 50–70 กก./ไร่ เมื่อปลูกครบ 30–45 วัน',
    irrigationPool: [0, 1],
  },
  {
    id: 'feed_corn', name: 'ข้าวโพดเลี้ยงสัตว์', regions: ['north', 'central', 'northeast'],
    rootDepthMm: 500, fcBias: -0.4, wpBias: 0.2,
    targetGaugePercent: 80, stressGaugePercent: 45, criticalGaugePercent: 28,
    rainSkipMm: 16, maxEventWaterMm: 24, cropCoefficient: 1.05, areaBandRai: [12, 160],
    perennial: false, plantMonth: 5, plantDayFrom: 10, plantDayTo: 26,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 24, label: 'ระยะงอก' },
      { fromDays: 25, toDays: 49, label: 'ระยะเติบโตทางลำต้น' },
      { fromDays: 50, toDays: 69, label: 'ระยะก่อนออกดอก–คลี่ดอก' },
      { fromDays: 70, toDays: 89, label: 'ระยะผสมเมล็ด' },
      { fromDays: 90, toDays: 104, label: 'ระยะเมล็ดแข็ง–เก็บเกี่ยว' },
      { fromDays: 105, toDays: 4000, label: 'ค้างฤดูเกินอายุเก็บเกี่ยว 100–105 วัน' },
    ],
    fertilizerFormula: '46-0-0 ร่วมกับ 18-46-0 รองก้นหลุม ตามเกณฑ์กรมวิชาการเกษตร',
    irrigationPool: [1, 0, 3],
  },
  {
    id: 'rubber', name: 'ยางพารา', regions: ['south', 'east', 'northeast'],
    rootDepthMm: 900, fcBias: -0.2, wpBias: 0.5,
    targetGaugePercent: 76, stressGaugePercent: 38, criticalGaugePercent: 22,
    rainSkipMm: 24, maxEventWaterMm: 26, cropCoefficient: 0.85, areaBandRai: [20, 300],
    perennial: true, plantMonth: 6, plantDayFrom: 15, plantDayTo: 30,
    perennialStartYear: 1994, perennialAgeBands: 32,
    growthWindows: [
      { fromDays: 0, toDays: 1095, label: 'สวนยางช่วงปลูกสร้าง (อายุไม่ถึง 3 ปี)' },
      { fromDays: 1096, toDays: 4745, label: 'สวนยางเปิดกรีดแล้ว อายุ 3–13 ปี' },
      { fromDays: 4746, toDays: 8760, label: 'สวนยางอายุมากใกล้รอบปลูกแทน (เกิน 13 ปี)' },
      { fromDays: 8761, toDays: 40_000, label: 'สวนยางอายุเกินรอบปลูกแทน ต้องตรวจโครงสร้างต้นและระบบราก' },
    ],
    fertilizerFormula: '18-4-5 หรือ 20-8-20 หว่านระหว่างแถวก่อนฝนรอบแรกและปลายฝน',
    irrigationPool: [4, 1, 0],
  },
  {
    id: 'oil_palm', name: 'ปาล์มน้ำมัน', regions: ['south', 'east'],
    rootDepthMm: 750, fcBias: 0.2, wpBias: 0.3,
    targetGaugePercent: 80, stressGaugePercent: 42, criticalGaugePercent: 25,
    rainSkipMm: 22, maxEventWaterMm: 30, cropCoefficient: 0.95, areaBandRai: [18, 260],
    perennial: true, plantMonth: 11, plantDayFrom: 10, plantDayTo: 25,
    perennialStartYear: 2001, perennialAgeBands: 24,
    growthWindows: [
      { fromDays: 0, toDays: 1460, label: 'ปาล์มอายุ 0–4 ปี ยังให้ผลผลิตไม่เต็มที่' },
      { fromDays: 1461, toDays: 5840, label: 'ปาล์มอายุ 4–16 ปี ช่วงให้ผลผลิตสูงสุด' },
      { fromDays: 5841, toDays: 10_950, label: 'ปาล์มอายุ 16–30 ปี ผลผลิตลดตามความสูงต้น' },
      { fromDays: 10_951, toDays: 40_000, label: 'ปาล์มอายุเกิน 30 ปี ควรวางแผนปลูกแทน' },
    ],
    fertilizerFormula: '21-0-0 เสริม 0-0-60 (MOP) แบ่ง 3 รอบ ตามน้ำหนักทะลาย',
    irrigationPool: [4, 3, 1],
  },
  {
    id: 'longan', name: 'ลำไย', regions: ['north'],
    rootDepthMm: 800, fcBias: -0.5, wpBias: 0.4,
    targetGaugePercent: 80, stressGaugePercent: 45, criticalGaugePercent: 28,
    rainSkipMm: 18, maxEventWaterMm: 20, cropCoefficient: 0.90, areaBandRai: [10, 120],
    perennial: true, plantMonth: 9, plantDayFrom: 10, plantDayTo: 26,
    perennialStartYear: 2003, perennialAgeBands: 22,
    growthWindows: [
      { fromDays: 0, toDays: 2190, label: 'ลำไยอายุ 2–6 ปี ยังไม่เข้าช่วงบังคับดอก' },
      { fromDays: 2191, toDays: 7300, label: 'ลำไยให้ผลผลิต อายุ 6–20 ปี' },
      { fromDays: 7301, toDays: 40_000, label: 'ลำไยอายุเกิน 20 ปี ต้องตัดแต่งทรงพุ่มก่อนบังคับดอก' },
    ],
    fertilizerFormula: '8-24-24 ก่อนบังคับดอก และ 13-13-21 ระหว่างผลขยาย',
    irrigationPool: [1, 2, 0],
  },
  {
    id: 'durian', name: 'ทุเรียน', regions: ['east', 'south', 'central'],
    rootDepthMm: 700, fcBias: -0.2, wpBias: 0.2,
    targetGaugePercent: 82, stressGaugePercent: 48, criticalGaugePercent: 30,
    rainSkipMm: 16, maxEventWaterMm: 18, cropCoefficient: 1.00, areaBandRai: [8, 90],
    perennial: true, plantMonth: 5, plantDayFrom: 12, plantDayTo: 28,
    perennialStartYear: 2006, perennialAgeBands: 19,
    growthWindows: [
      { fromDays: 0, toDays: 2190, label: 'ทุเรียนรุ่นสร้างทรงพุ่ม อายุ 0–6 ปี' },
      { fromDays: 2191, toDays: 6570, label: 'ทุเรียนให้ผลผลิต อายุ 6–18 ปี' },
      { fromDays: 6571, toDays: 40_000, label: 'ทุเรียนอายุมาก ต้องตรวจรากเน่า–โคนเน่าทุกฤดูฝน' },
    ],
    fertilizerFormula: '12-12-17+2 แบ่งรอบ ตามระยะพัฒนาผลของกรมวิชาการเกษตร',
    irrigationPool: [0, 1, 4],
  },
  {
    id: 'mango', name: 'มะม่วง', regions: ['north', 'central', 'northeast', 'east'],
    rootDepthMm: 850, fcBias: -0.3, wpBias: 0.3,
    targetGaugePercent: 78, stressGaugePercent: 42, criticalGaugePercent: 25,
    rainSkipMm: 18, maxEventWaterMm: 22, cropCoefficient: 0.90, areaBandRai: [10, 140],
    perennial: true, plantMonth: 7, plantDayFrom: 8, plantDayTo: 24,
    perennialStartYear: 2005, perennialAgeBands: 20,
    growthWindows: [
      { fromDays: 0, toDays: 1825, label: 'มะม่วงยังไม่ให้ผลผลิต อายุ 0–5 ปี' },
      { fromDays: 1826, toDays: 6205, label: 'มะม่วงให้ผลผลิต อายุ 5–17 ปี' },
      { fromDays: 6206, toDays: 40_000, label: 'มะม่วงอายุเกิน 17 ปี ควรตัดแต่งกิ่งใหญ่และคุมทรงพุ่ม' },
    ],
    fertilizerFormula: '15-15-15 ก่อนออกดอก และ 13-13-21 ระหว่างผลขยาย',
    irrigationPool: [0, 1, 4],
  },
  {
    id: 'vegetable', name: 'ผักยกแปลง', regions: ['central', 'north', 'east'],
    rootDepthMm: 250, fcBias: 0.6, wpBias: -0.4,
    targetGaugePercent: 88, stressGaugePercent: 52, criticalGaugePercent: 34,
    rainSkipMm: 12, maxEventWaterMm: 10, cropCoefficient: 0.90, areaBandRai: [4, 60],
    perennial: false, plantMonth: 11, plantDayFrom: 2, plantDayTo: 27,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 179, label: 'รอรุ่นถัดไป (แปลงหมุนเวียนทุก 45–55 วัน)' },
      { fromDays: 180, toDays: 204, label: 'ระยะกล้า' },
      { fromDays: 205, toDays: 229, label: 'ระยะเจริญทางใบ' },
      { fromDays: 230, toDays: 244, label: 'ระยะเก็บเกี่ยวรุ่นแรก' },
      { fromDays: 245, toDays: 4000, label: 'พักแปลงเพื่อตัดรุ่นหมุนเวียน' },
    ],
    fertilizerFormula: '46-0-0 เจือจางให้ไปพร้อมระบบน้ำ (fertigation) ทุก 5–7 วัน',
    irrigationPool: [2, 1, 0],
  },
  {
    id: 'banana', name: 'กล้วยหอม', regions: ['north', 'central', 'east', 'south'],
    rootDepthMm: 500, fcBias: 0.2, wpBias: 0.1,
    targetGaugePercent: 80, stressGaugePercent: 45, criticalGaugePercent: 28,
    rainSkipMm: 16, maxEventWaterMm: 20, cropCoefficient: 1.00, areaBandRai: [8, 110],
    perennial: true, plantMonth: 3, plantDayFrom: 6, plantDayTo: 26,
    perennialStartYear: 2022, perennialAgeBands: 4,
    growthWindows: [
      { fromDays: 0, toDays: 210, label: 'กล้วยปลูกใหม่ อายุไม่ถึง 7 เดือน' },
      { fromDays: 211, toDays: 330, label: 'กล้วยออกเครือ' },
      { fromDays: 331, toDays: 420, label: 'กล้วยใกล้ตัดหวี (อายุ 11–14 เดือน)' },
      { fromDays: 421, toDays: 40_000, label: 'กล้วยเกินรอบตัดแล้ว ต้องเลือกหน่อแทนต้นแม่' },
    ],
    fertilizerFormula: '13-13-21 หรือ 14-10-10 ทุก 2 เดือน ร่วมกับปุ๋ยอินทรีย์รองพื้น',
    irrigationPool: [0, 1, 2],
  },
  {
    id: 'pineapple', name: 'สับปะรด', regions: ['central', 'east', 'south', 'north'],
    rootDepthMm: 450, fcBias: 0.1, wpBias: 0.2,
    targetGaugePercent: 76, stressGaugePercent: 40, criticalGaugePercent: 24,
    rainSkipMm: 18, maxEventWaterMm: 18, cropCoefficient: 0.85, areaBandRai: [15, 220],
    perennial: false, plantMonth: 2, plantDayFrom: 8, plantDayTo: 26,
    perennialStartYear: 0, perennialAgeBands: 0,
    growthWindows: [
      { fromDays: 0, toDays: 139, label: 'ระยะตั้งตัวหลังปลูกจุก/หน่อ' },
      { fromDays: 140, toDays: 279, label: 'ระยะสร้างใบและสะสมอาหาร' },
      { fromDays: 280, toDays: 329, label: 'ระยะบังคับดอก' },
      { fromDays: 330, toDays: 374, label: 'ระยะผลพัฒนา' },
      { fromDays: 375, toDays: 4000, label: 'ระยะเก็บเกี่ยว (อายุ 15–18 เดือน)' },
    ],
    fertilizerFormula: '25-7-7 ฉีดพ่นทางใบ 2–3 รอบ ก่อนบังคับดอกตามรูปแบบสับปะรดโรงงาน',
    irrigationPool: [3, 1, 0],
  },
];

/** พืชที่ "เหมาะสมกับภาค" ใช้เป็นกลุ่มอ้างอิงการเลือกพืชต่อจังหวัด ไม่ใช่สถิติพื้นที่ปลูกจริง */
const CROPS_BY_REGION: Record<RegionKey, CropDef[]> = Object.fromEntries(
  REGIONS.map((region) => [region.key, CROPS.filter((crop) => crop.regions.includes(region.key))]),
) as Record<RegionKey, CropDef[]>;

const REGION_LABEL: Record<RegionKey, string> = Object.fromEntries(
  REGIONS.map((region) => [region.key, region.label]),
) as Record<RegionKey, string>;

/* ------------------------------------------------------------------ */
/* จำนวนแปลงนอกเหนือจาก 1 แปลง/จังหวัด และชื่ออำเภอประกอบ label         */
/* ------------------------------------------------------------------ */

/** จังหวัดเกษตรแปลงใหญ่/เขตชลประทานหนาแน่นได้แปลงเพิ่ม 1–2 แปลง ที่เหลือมี 1 แปลง */
const EXTRA_FARM_BY_PROVINCE: Record<string, number> = {
  '14': 2, '22': 2, '30': 2, '34': 2, '50': 2, '65': 2, '72': 2, '84': 2,
  '20': 1, '24': 1, '27': 1, '40': 1, '31': 1, '33': 1, '45': 1, '60': 1,
  '67': 1, '70': 1, '76': 1, '77': 1, '80': 1, '86': 1, '90': 1,
};

/**
 * ชื่ออำเภอ/เขตที่ใช้ประกอบ districtLabel ของแปลง
 * เป็นชื่ออำเภอจริงของจังหวัดนั้น แต่ label นี้ยังไม่ได้ตรวจกับทะเบียนอำเภอ/ตำบล
 * จังหวัดที่ไม่มีรายชื่อที่นี่จะใช้ "อำเภอเมือง+ชื่อจังหวัด" (กรุงเทพมหานครใช้เขตลาดกระบัง)
 */
const DISTRICT_HINTS: Record<string, string[]> = {
  '10': ['เขตลาดกระบัง', 'เขตหนองจอก'],
  '14': ['อำเภอลาดบัวหลวง', 'อำเภอเสนา', 'อำเภอภาชี'],
  '20': ['อำเภอพานทอง', 'อำเภอบ้านบึง'],
  '22': ['อำเภอโป่งน้ำร้อน', 'อำเภอมะขาม'],
  '24': ['อำเภอท่าตะเกียบ', 'อำเภอแปลงยาว'],
  '27': ['อำเภอตาพระยา', 'อำเภอวัฒนานคร'],
  '30': ['อำเภอพิมาย', 'อำเภอสูงเนิน', 'อำเภอโชคชัย'],
  '31': ['อำเภอประโคนชัย', 'อำเภอสตึก'],
  '33': ['อำเภอขุนหาญ', 'อำเภอห้วยทับทัน'],
  '34': ['อำเภอวารินชำราบ', 'อำเภอม่วงสามสิบ'],
  '40': ['อำเภอชนบท', 'อำเภอกระนวน'],
  '45': ['อำเภอโพนทอง'],
  '50': ['อำเภอสารภี', 'อำเภอสันป่าตอง', 'อำเภอแม่ริม'],
  '60': ['อำเภอตาคลี', 'อำเภอเก้าเลี้ยว'],
  '65': ['อำเภอพรหมพิราม', 'อำเภอบางระกำ'],
  '67': ['อำเภอเขาค้อ', 'อำเภอหล่มสัก'],
  '70': ['อำเภอบางแพ', 'อำเภอจอมบึง'],
  '72': ['อำเภอเดิมบางนางบวช', 'อำเภอสองพี่น้อง', 'อำเภออู่ทอง'],
  '76': ['อำเภอท่ายาง', 'อำเภอบ้านลาด'],
  '77': ['อำเภอปราณบุรี', 'อำเภอกุยบุรี', 'อำเภอทับสะแก'],
  '80': ['อำเภอปากพนัง', 'อำเภอเชียรใหญ่'],
  '84': ['อำเภอเคียนซา', 'อำเภอบ้านนาเดิม', 'อำเภอชัยบุรี'],
  '86': ['อำเภอท่าแซะ', 'อำเภอปะทิว'],
  '90': ['อำเภอควนเนียง', 'อำเภอระโนด'],
};

/* ------------------------------------------------------------------ */
/* ชื่อแปลง: หน่วยงานรัฐ / สหกรณ์-แปลงใหญ่ / เอกชน                      */
/* ------------------------------------------------------------------ */

function governmentName(province: string, district: string, crop: string, seedKey: string): { name: string; agency: string } {
  const shortDistrict = district.replace(/^(อำเภอ|เขต)/, '');
  const patterns = [
    { name: `แปลงสาธิตเกษตรอัจฉริยะ ${shortDistrict} จ.${province}`, agency: 'กรมชลประทาน (RID)' },
    { name: `แปลงวิจัย${crop} ${province} (กรมวิชาการเกษตร)`, agency: 'กรมวิชาการเกษตร (DOA)' },
    { name: `ศูนย์เรียนรู้การเพิ่มประสิทธิภาพการผลิตสินค้าเกษตร ${shortDistrict}`, agency: 'กรมส่งเสริมการเกษตร (DOAE)' },
    { name: `แปลงติดตามสถานะ${crop} สศก. ${province}`, agency: 'สำนักงานเศรษฐกิจการเกษตร (สศก.)' },
  ];
  return patterns[pickIndex(seedKey, patterns.length)];
}

const KEAO_HIN_SON_NAME = 'ศูนย์ศึกษาการพัฒนาเขาหินซ้อนอันเนื่องมาจากพระราชดำริ แปลงเกษตรทฤษฎีใหม่';
const KEAO_HIN_SON_AGENCY = 'สำนักงาน กปร. / ศูนย์ศึกษาการพัฒนาเขาหินซ้อนฯ';

function cooperativeName(province: string, district: string, crop: string, seedKey: string): string {
  const shortDistrict = district.replace(/^(อำเภอ|เขต)/, '');
  const patterns = [
    `สหกรณ์การเกษตร${province} จำกัด แปลงใหญ่${crop} ${shortDistrict}`,
    `วิสาหกิจชุมชนแปลงใหญ่${crop} ${shortDistrict} จ.${province}`,
    `กลุ่มผู้ผลิต${crop}คุณภาพ ${shortDistrict} จ.${province}`,
    `สหกรณ์ผู้ปลูก${crop}${province} จำกัด`,
  ];
  return patterns[pickIndex(seedKey, patterns.length)];
}

const PRIVATE_NAME_WORDS = [
  'ศิริพันธ์', 'ดวงกมล', 'มั่นคงพืชผล', 'บัวคำ', 'เขาท่าฟ้า', 'ทุ่งโพธิ์', 'วารีสุข', 'อุดมผล',
  'สวนแม่ละเมา', 'เนินมะกอง', 'ดงละอุ่น', 'ท่าเรือเขียว', 'สมบูรณ์ทรัพย์', 'ลาดบัวไร่นาสวน',
  'บ้านไร่ปลายฝัน', 'สวนแสงทอง', 'คุ้งน้ำวน', 'ห้วยแก้ว',
];

function privateName(seedKey: string, crop: string, provinceCode: string, index: number): string {
  const word = pick(`sf:plotname:word:${provinceCode}:${index}:${seedKey}`, PRIVATE_NAME_WORDS);
  const patterns = [
    `${word} Smart Farm`,
    `สวน${word} (${crop}นอกฤดู)`,
    `${word} Agri-Pilot`,
    `ฟาร์มอัจฉริยะ${word}`,
  ];
  return patterns[pickIndex(`sf:plotname:pattern:${provinceCode}:${index}`, patterns.length)];
}

/* ------------------------------------------------------------------ */
/* นิยามเซนเซอร์รายชนิด                                                 */
/* ------------------------------------------------------------------ */

interface KindDef {
  unit: string;
  lowThreshold: number | null;
  highThreshold: number | null;
  decimals: number;
}

const KIND_DEFS: Record<SensorKind, KindDef> = {
  soil_moisture: { unit: '%VWC', lowThreshold: null, highThreshold: null, decimals: 1 },
  air_temperature: { unit: '°C', lowThreshold: 17, highThreshold: 38, decimals: 1 },
  relative_humidity: { unit: '%RH', lowThreshold: 45, highThreshold: 92, decimals: 0 },
  par_light: { unit: 'klx', lowThreshold: 10, highThreshold: 95, decimals: 1 },
  npk: { unit: 'ppm', lowThreshold: null, highThreshold: null, decimals: 0 },
  water_flow: { unit: 'L/min', lowThreshold: 8, highThreshold: 120, decimals: 1 },
  rainfall: { unit: 'mm/24ชม.', lowThreshold: null, highThreshold: 60, decimals: 1 },
};

const FIRMWARE_MINOR: Record<SensorKind, string> = {
  soil_moisture: '2.4', air_temperature: '3.1', relative_humidity: '3.1',
  par_light: '1.9', npk: '0.9', water_flow: '2.2', rainfall: '1.6',
};

/* ------------------------------------------------------------------ */
/* แหล่งอ้างอิง (metadata เท่านั้น)                                      */
/* ------------------------------------------------------------------ */

const SOURCES: SmartFarmingSourceRef[] = [
  {
    id: 'rid-demo-plots',
    name: 'กรมชลประทาน — แปลงสาธิตและศูนย์เรียนรู้ในเขตส่งน้ำ',
    url: 'https://www.rid.go.th/',
    note: 'ใช้เป็นรูปแบบเจ้าของแปลงกับเขตชลประทาน ยังไม่มี resource telemetry จากกรมชลประทานใน Hub',
    access: 'metadata_only',
  },
  {
    id: 'doa-smart-agri',
    name: 'กรมวิชาการเกษตร — แนวทางการวัดความชื้นดินและคำแนะนำปุ๋ยรายพืช',
    url: 'https://www.doa.go.th/',
    note: 'ช่วงความชื้นที่พืชใช้ได้และสูตรปุ๋ยอ้างอิงรูปแบบเอกสารเผยแพร่ ยังไม่ใช่การอ้างค่าจากแปลงวิจัยจริง',
    access: 'metadata_only',
  },
  {
    id: 'ldd-soil-texture',
    name: 'กรมพัฒนาที่ดิน — การจำแนกชั้นเนื้อดินและสมบัติดินเชิงอนุรักษ์',
    url: 'https://ldd.go.th/',
    note: 'ค่า field capacity / permanent wilting point ต่อเนื้อดินเป็นค่าเริ่มต้นทาง agronomy ไม่ใช่ผลตรวจวิเคราะห์ตัวอย่างดินจริง',
    access: 'metadata_only',
  },
  {
    id: 'oae-reference',
    name: 'สำนักงานเศรษฐกิจการเกษตร (สศก.) — ทะเบียนสินค้าเกษตรและพื้นที่เพาะปลูกอ้างอิง',
    url: 'https://www.oae.go.th/',
    note: 'ใช้อ้างอิงการจัดกลุ่มพืชที่เหมาะกับแต่ละภาคเท่านั้น ไม่ได้ผูกกับสถิติพื้นที่ปลูกจริงรายจังหวัด',
    access: 'metadata_only',
  },
  {
    id: 'rspb-keao-hin-son',
    name: 'สำนักงาน กปร. / ศูนย์ศึกษาการพัฒนาเขาหินซ้อนฯ — แปลงเกษตรทฤษฎีใหม่',
    url: 'https://www.rspb.go.th/',
    note: 'ชื่อหน่วยงานสาธิตมีจริง แต่ค่าตัวเลขที่แสดงในแปลงเป็นแบบจำลอง deterministic ทั้งหมด',
    access: 'metadata_only',
  },
  {
    id: 'iot-simulator',
    name: 'ตัวสร้างค่าตัวอย่างเกษตรอัจฉริยะของ Hub (deterministic simulator)',
    url: null,
    note: 'แหล่งกำเนิดค่าจริงของทุกตัวเลขในไฟล์นี้ ใช้ seed จาก farmId/nodeId/ชั่วโมง ไม่มีการเรียก gateway, LoRaWAN หรือ MQTT',
    access: 'metadata_only',
  },
];

const COVERAGE_NOTE =
  'รายชื่อจังหวัดทั้ง 77 ในชุดนี้เป็นกลุ่มอ้างอิงตามทะเบียนจังหวัดที่ Hub ใช้จัดกลุ่มข้อมูล ไม่ใช่พื้นที่ที่ยืนยันว่าติดตั้งเซนเซอร์จริง '
  + 'และไม่ใช่หลักฐานว่าครอบคลุมพื้นที่จริง — จำนวนแปลงต่อจังหวัดกำหนดโดยกติกาแบบจำลองให้ทุกจังหวัดมีแปลงสาธิตอย่างน้อย 1 แปลง '
  + 'จังหวัดเกษตรหลักจึงมี 2–3 แปลง ตัวเลขรวมจึงไม่ใช่จำนวนฟาร์ม IoT ของประเทศ';

const WARNINGS: string[] = [
  'ตัวเลขทุกช่องในชุดนี้เป็นค่าตัวอย่างแบบ deterministic (seed จาก farmId/nodeId/ชั่วโมง/ชนิดข้อมูล) เพื่อสาธิตหน้าจอ ไม่ใช่ค่า telemetry จริงจาก broker หรือระบบจัดเก็บข้อมูลฟาร์มใด ๆ',
  'ไม่มีการเรียก LoRaWAN gateway, MQTT broker, SCADA ของเขตชลประทาน หรือ API ของผู้ขายเซนเซอร์รายใดในรอบ build นี้',
  'รายชื่อ 77 จังหวัดเป็นกลุ่มอ้างอิงตามทะเบียนจังหวัด ไม่ใช่ข้อสรุปว่าครอบคลุมพื้นที่จริง การมีชื่อจังหวัดไม่ได้แปลว่ามีการติดตั้งเซนเซอร์ และจำนวนแปลงต่อจังหวัดเกิดจากกติกาของแบบจำลอง',
  'ค่า field capacity / permanent wilting point และช่วงความชื้นที่พืชใช้ได้เป็นค่าเริ่มต้นทาง agronomy ต่อเนื้อดินและรายพืช ยังไม่ได้สอบเทียบกับตัวอย่างดินของแปลงจริง ต้องวิเคราะห์ดินก่อนใช้ออกแบบรอบน้ำ',
  'battery %, lastSeenAt, firmware และสถานะ online/offline ของโหนดเป็นค่า simulated ไม่ใช่อายุถ่านจริงและไม่ใช่บันทึก uptime ของอุปกรณ์จริง',
  'ชื่ออำเภอ/เขตใน districtLabel และชื่อแปลงใน farmName ตั้งขึ้นเพื่อให้หน้าจออ่านสมจริง ยังไม่ได้ตรวจกับทะเบียนอำเภอ/ตำบล และไม่ได้ยืนยันว่าแปลงเป็นของหน่วยงานที่ระบุ',
  'ฝนสะสม 24 ชั่วโมงและ ET0 รายชั่วโมงมาจากชุดค่าจำลองภายในไฟล์นี้ ไม่ใช่ค่าตรวจวัดของสถานีกรมอุตุนิยมวิทยา และไม่ใช่ผลจาก lane Open-Meteo ที่ต่ออยู่คนละ path',
  'หน่วยและมิติของค่า (grain) ผูกกับตำแหน่งวัด ห้ามเทียบข้าม: %VWC คือสัดส่วนปริมาตรน้ำต่อปริมาตรดินที่ความลึกของโพรบ, มม. คือปริมาณต่อพื้นที่, ppm คือค่าจากโพรบในแปลง ไม่ใช่ค่ารายกริดหรือรายจังหวัด และโหนดที่ไม่รายงานค่าต้องเป็น null ไม่ใช่ 0',
];

const GAPS: SmartFarmingGap[] = [
  {
    title: 'ยังไม่มี resource telemetry จากหน่วยงานต้นทาง',
    detail:
      'แคตตาล็อกปัจจุบัน (config/sources.json และ config/resource_licenses.json) ยังไม่มี resource ประเภท sensor observation ของกรมชลประทาน กรมวิชาการเกษตร หรือผู้ขายระบบ IoT ที่ผ่านสิทธิ์เผยแพร่ จึงแทนที่ค่าจำลองด้วยค่าจริงในรอบนี้ไม่ได้',
  },
  {
    title: 'ไม่ได้เก็บ calibration record ของโพรบความชื้น',
    detail:
      'โพรบความชื้นดินต้องเทียบค่ากับผลการชั่งน้ำหนักดิน (gravimetric) หรือ TDR ที่สอบเทียบแล้วก่อนใช้ออกแบบรอบน้ำ ชุดนี้ไม่มีฟิลด์ calibration และวันที่สอบเทียบ ค่า FC/WP จึงเป็นค่าตามชั้นเนื้อดิน ไม่ใช่ค่าของไซต์',
  },
  {
    title: 'districtLabel ยังไม่ได้ crosswalk กับทะเบียนอำเภอ',
    detail:
      'ไฟล์นี้ไม่มีรายการอำเภอ/ตำบลที่เป็นแหล่งอ้างอิงอย่างเป็นทางการ จึงใส่เฉพาะอำเภอที่วางใจได้เป็นชื่อประกอบ และไม่ได้หมายความว่าแปลงตั้งอยู่ในอำเภอนั้นจริง ห้าม join กับตารางพื้นที่เพาะปลูกระดับอำเภอ',
  },
  {
    title: 'รอบน้ำไม่ได้ผูกกับตารางส่งน้ำและสิทธิ์น้ำจริง',
    detail:
      'เวลาและปริมาณน้ำที่แนะนำคำนวณจากสมดุลความชื้น + ET0 ของแบบจำลองเท่านั้น ไม่ได้ผูกกับตารางส่งน้ำของกรมชลประทาน ขนาดคลองซอย อัตราการไหลตามความเป็นจริงของหัวน้ำ หรือสิทธิ์น้ำของเกษตรกร',
  },
  {
    title: 'ค่า NPK จากโพรบเป็นค่าจำลองความแม่นต่ำ',
    detail:
      'โพรบ ISE อ่าน N/P/K ได้เชิงพาณิชย์แต่ความแม่นต่ำและเพี้ยนตามความชื้นกับเนื้อดิน ชุดนี้จึงให้คำแนะนำระดับแนวทาง และห้ามใช้แทนผลการตรวจวิเคราะห์ดินของห้องปฏิบัติการ',
  },
  {
    title: 'จำนวนแปลงไม่ใช่สถิติการติดตั้งเกษตรอัจฉริยะของประเทศ',
    detail:
      'การวาง 1 แปลง/จังหวัด บวกแปลงเพิ่มในจังหวัดเกษตรหลัก มีเจตนาให้หน้าจอครบทั้ง 77 จังหวัด ตัวเลขรวมจึงไม่ใช่อุดมการณ์จำนวนฟาร์มที่มีระบบอัจฉริยะจริง และห้ามนำไปคำนวณ share ของประเทศ',
  },
];

/* ------------------------------------------------------------------ */
/* identity ของแปลง                                                     */
/* ------------------------------------------------------------------ */

interface Identity {
  farmId: string;
  provinceCode: string;
  provinceName: string;
  regionKey: RegionKey;
  districtLabel: string;
  farmType: FarmPlot['farmType'];
  ownerAgency: string;
  farmName: string;
  crop: CropDef;
  texture: SoilTextureDef;
  irrigation: IrrigationDef;
  areaRai: number;
}

function buildIdentity(provinceCode: string, provinceName: string, index: number): Identity {
  const seedKey = `sf:profile:${provinceCode}:${index}`;
  const regionKey = REGION_BY_PROVINCE[provinceCode];
  const regionCrops = CROPS_BY_REGION[regionKey];
  const crop = regionCrops[pickIndex(`${seedKey}|crop`, regionCrops.length)];
  const textureIndex = TEXTURE_POOL[regionKey][pickIndex(`${seedKey}|texture`, TEXTURE_POOL[regionKey].length)];
  const texture = SOIL_TEXTURES[textureIndex];
  const irrigation = IRRIGATION_SYSTEMS[crop.irrigationPool[pickIndex(`${seedKey}|irrigation`, crop.irrigationPool.length)]];
  const farmType = (['government_demo', 'cooperative', 'private_demo'] as const)[index % 3];

  const hints = DISTRICT_HINTS[provinceCode];
  const districtLabel = hints
    ? hints[pickIndex(`${seedKey}|district`, hints.length)]
    : `อำเภอเมือง${provinceName}`;

  let farmName: string;
  let ownerAgency: string;
  if (provinceCode === '24' && index === 0) {
    farmName = KEAO_HIN_SON_NAME;
    ownerAgency = KEAO_HIN_SON_AGENCY;
  } else if (farmType === 'government_demo') {
    const built = governmentName(provinceName, districtLabel, crop.name, `${seedKey}|agency`);
    farmName = built.name;
    ownerAgency = built.agency;
  } else if (farmType === 'cooperative') {
    farmName = cooperativeName(provinceName, districtLabel, crop.name, `${seedKey}|coop`);
    ownerAgency = 'กรมส่งเสริมสหกรณ์ / สหกรณ์จังหวัด';
  } else {
    farmName = privateName(`${seedKey}|private`, crop.name, provinceCode, index);
    ownerAgency = 'เอกชน (แปลงทดลองเชิงพาณิชย์)';
  }

  return {
    farmId: `SF-${provinceCode}-${pad2(index + 1)}`,
    provinceCode,
    provinceName,
    regionKey,
    districtLabel,
    farmType,
    ownerAgency,
    farmName,
    crop,
    texture,
    irrigation,
    areaRai: intBetween(`${seedKey}|area`, crop.areaBandRai[0], crop.areaBandRai[1]),
  };
}

/** วันปลูกและระยะเจริญเติบโต เทียบกับ REPORT_DATE (ใช้เฉพาะวันทำการปลูกและจำนวนวัน ไม่ได้ใช้ clock จริง) */
function buildPlantStage(crop: CropDef, farmId: string): { plantDate: string; growthStage: string } {
  const seedKey = `sf:plant:${farmId}`;
  const day = intBetween(`${seedKey}|day`, crop.plantDayFrom, Math.min(crop.plantDayTo, 28));

  let plantYear: number;
  if (crop.perennial) {
    plantYear = crop.perennialStartYear + 1 + pickIndex(`${seedKey}|age`, crop.perennialAgeBands);
  } else {
    plantYear = REPORT_YEAR;
  }
  let plantDate = civilDate(plantYear, crop.plantMonth, day);
  if (plantDate > REPORT_DATE) plantDate = civilDate(plantYear - 1, crop.plantMonth, day);

  const daysAfter = Math.max(0, daysBetweenCivil(plantDate, REPORT_DATE));
  const window = crop.growthWindows.find((item) => daysAfter >= item.fromDays && daysAfter <= item.toDays)
    ?? crop.growthWindows[crop.growthWindows.length - 1];
  return { plantDate, growthStage: window.label };
}

/* ------------------------------------------------------------------ */
/* สมดุลน้ำในแปลง: gauge, ฝนรายชั่วโมง, ET0                              */
/* ------------------------------------------------------------------ */

/** gauge = ตำแหน่งความชื้นระหว่างจุดแห้งตายถาวร (0) กับ field capacity (100) */
function drawMoistureGauge(farmId: string, regionKey: RegionKey, rain24Mm: number, crop: CropDef): number {
  const band: Record<RegionKey, [number, number]> = {
    south: [46, 97], east: [40, 94], central: [33, 92], north: [37, 93], northeast: [28, 88],
  };
  const [min, max] = band[regionKey];
  let gauge = Math.round(between(`sf:soil:${farmId}`, min, max));
  if (rain24Mm >= crop.rainSkipMm * 2) {
    // ฝนหนักกว่าเกณฑ์งดน้ำราว 2 เท่า: ดินชั้นบนอิ่มตัวชั่วคราว จึงอยู่เหนือ field capacity (gauge > 100)
    gauge = Math.round(between(`sf:soil:${farmId}|saturated`, 101, 112));
  } else if (rain24Mm >= crop.rainSkipMm) gauge = Math.max(gauge, 70);
  else if (rain24Mm >= 8) gauge = Math.max(gauge, 56);
  else if (draw(`sf:soil:${farmId}|dry-spot`) < 0.13) {
    // แปลงดินทรายจัด/ที่ลาดชันที่น้ำไหลบ่าเร็วและไม่มีฝนเติมรอบ 24 ชม.: ตกเข้าช่วงเครียดถึงวิกฤต
    gauge = Math.round(between(`sf:soil:${farmId}|dry-gauge`, 6, crop.stressGaugePercent - 3));
  }
  return clamp(gauge, 6, 104);
}

function classifyMoisture(gauge: number, crop: CropDef): MoistureStatus {
  if (gauge > 100) return 'saturated';
  if (gauge < crop.criticalGaugePercent) return 'critical';
  if (gauge < crop.stressGaugePercent) return 'deficit';
  if (gauge < 62) return 'watch';
  return 'adequate';
}

interface RainPlan {
  rainHours: number[];
  weights: number[];
  totalMm: number;
}

function buildRainPlan(farmId: string, regionKey: RegionKey): RainPlan {
  const chance: Record<RegionKey, number> = {
    south: 0.62, east: 0.54, central: 0.46, north: 0.44, northeast: 0.40,
  };
  if (draw(`sf:rain:${farmId}|chance`) > chance[regionKey]) {
    return { rainHours: [], weights: [], totalMm: 0 };
  }

  const startHour = intBetween(`sf:rain:${farmId}|start`, 11, 19);
  const duration = intBetween(`sf:rain:${farmId}|duration`, 2, 4);
  const peak = between(`sf:rain:${farmId}|peak`, 3.5, 19.5);

  const rainHours: number[] = [];
  const weights: number[] = [];
  for (let offset = 0; offset < duration; offset += 1) {
    const hour = startHour + offset;
    if (hour > 23) break;
    rainHours.push(hour);
    weights.push(0.55 + 0.45 * Math.sin((Math.PI * (offset + 0.5)) / duration));
  }
  const shapeTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const rawTotal = peak * shapeTotal;
  return { rainHours, weights, totalMm: round(rawTotal, 1) };
}

interface HourSeries {
  temps: number[];
  humidity: number[];
  light: number[];
  rain: number[];
  wind: number[];
  et0: number[];
  et0Daily: number;
  rainTotalMm: number;
  cloudiness: number;
}

function buildHourSeries(farmId: string, regionKey: RegionKey, plan: RainPlan): HourSeries {
  const meanBand: Record<RegionKey, [number, number]> = {
    north: [25.5, 28.5], northeast: [26.0, 29.0], central: [27.0, 29.8], east: [26.5, 29.2], south: [26.8, 29.0],
  };
  const [meanMin, meanMax] = meanBand[regionKey];
  const dailyMean = between(`sf:hour:${farmId}|mean`, meanMin, meanMax);
  const amplitude = between(`sf:hour:${farmId}|amp`, 4.5, 8.5);
  const cloudiness = plan.rainHours.length > 0
    ? clamp(0.38 + plan.totalMm / 70, 0.38, 0.85)
    : between(`sf:hour:${farmId}|cloud`, 0.12, 0.52);
  const peakLux = between(`sf:hour:${farmId}|peakLux`, 78, 108);

  const temps: number[] = [];
  const humidity: number[] = [];
  const light: number[] = [];
  const wind: number[] = [];
  const rain = new Array<number>(24).fill(0);

  for (let hour = 0; hour < 24; hour += 1) {
    // คลื่นอุณหภูมิรายวัน: ต่ำสุดใกล้ 04:00 น. สูงสุดใกล้ 16:00 น. และเพดานลดตามเมฆ
    const phase = Math.sin((2 * Math.PI * (hour - 10)) / 24);
    temps.push(round(dailyMean + amplitude * phase * (1 - 0.25 * cloudiness)
      + between(`sf:hour:${farmId}:${hour}:temp`, -0.5, 0.5), 1));

    humidity.push(Math.round(clamp(78 - 20 * phase - 6 * cloudiness
      + between(`sf:hour:${farmId}:${hour}:rh`, -3.5, 3.5), 46, 99)));

    const sunProgress = (hour - 6) / 12;
    const bell = sunProgress > 0 && sunProgress < 1 ? Math.sin(Math.PI * sunProgress) : 0;
    light.push(round(peakLux * bell * (1 - 0.72 * cloudiness), 1));

    const windBase = between(`sf:hour:${farmId}:${hour}:wind`, 0.6, 3.4);
    wind.push(round(clamp(windBase + (hour >= 12 && hour <= 17 ? 0.9 : 0), 0.4, 6.8), 1));
  }

  plan.rainHours.forEach((hour, position) => {
    const shareTotal = plan.weights.reduce((sum, weight) => sum + weight, 0);
    rain[hour] = round((plan.totalMm * plan.weights[position]) / shareTotal, 1);
  });
  const rainTotalMm = round(rain.reduce((sum, value) => sum + value, 0), 1);

  // ET0 รายวันด้วย Hargreaves (ใช้ Tmin/Tmax จาก series + Ra เทียบเท่ารายเดือน ~13.6 มม./วัน สำหรับ ต.ค. แถบละติจูดไทย)
  const tMax = Math.max(...temps);
  const tMin = Math.min(...temps);
  const tMean = temps.reduce((sum, value) => sum + value, 0) / temps.length;
  const hargreaves = 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(1, tMax - tMin)) * 13.6;
  const et0Daily = round(hargreaves * (1 - 0.30 * cloudiness), 2);

  // กระจาย ET0 รายวันตามสัดส่วนแสง (กลางคืนเป็น 0) และปัดเศษคงผลรวมให้เท่ากับรายวัน
  const lightTotal = light.reduce((sum, value) => sum + value, 0);
  const et0 = light.map((value) => round(et0Daily * (lightTotal > 0 ? value / lightTotal : 0), 2));
  const peakHour = et0.reduce((best, value, index) => (value > et0[best] ? index : best), 0);
  const residual = round(et0Daily - et0.reduce((sum, value) => sum + value, 0), 2);
  et0[peakHour] = round(et0[peakHour] + residual, 2);

  return { temps, humidity, light, rain, wind, et0, et0Daily, rainTotalMm, cloudiness };
}

/**
 * เส้น 24 ชั่วโมง: ความชื้นดินเดินจากค่าเริ่มต้น (ย้อนจากค่าปัจจุบันด้วยสมดุลน้ำ)
 * เพื่อให้ชั่วโมงที่ 23 ตรงกับ soilMoisturePercent ของแปลงพอดี
 */
function buildMicroclimate(
  series: HourSeries,
  crop: CropDef,
  currentVhc: number,
  fieldCapacity: number,
  wiltingPoint: number,
): MicroclimateHour[] {
  const deltas = series.et0.map((et0, hour) => {
    const uptakeMm = et0 * crop.cropCoefficient;
    const effectiveRainMm = series.rain[hour] * 0.85; // ฝนส่วนหนึ่งไหลบ่า/ระเหยก่อนถึงเขตราก
    return ((effectiveRainMm - uptakeMm) * 100) / crop.rootDepthMm;
  });
  const netChange = deltas.reduce((sum, value) => sum + value, 0);

  let running = currentVhc - netChange;
  const hours: MicroclimateHour[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    running += deltas[hour];
    hours.push({
      hourLabel: `${pad2(hour)}:00`,
      time: isoAtBangkok(hour * 60),
      airTempC: series.temps[hour],
      humidityPercent: series.humidity[hour],
      soilMoisturePercent: hour === 23
        ? currentVhc
        : round(clamp(running, wiltingPoint - 2, fieldCapacity + 3), 1),
      lightKlux: series.light[hour],
      rainfallMm: series.rain[hour],
      windSpeedMs: series.wind[hour],
      et0Mm: series.et0[hour],
    });
  }
  return hours;
}

/* ------------------------------------------------------------------ */
/* NPK: ppm, คำวินิจฉัย และคำแนะนำปุ๋ย                                  */
/* ------------------------------------------------------------------ */

interface NpkBand {
  nLow: number;
  nHigh: number;
  pLow: number;
  pHigh: number;
  kLow: number;
  kHigh: number;
}

const NPK_BANDS: Record<'rich_clay' | 'typical' | 'sandy_low', NpkBand> = {
  rich_clay: { nLow: 22, nHigh: 52, pLow: 13, pHigh: 34, kLow: 110, kHigh: 195 },
  typical: { nLow: 18, nHigh: 45, pLow: 10, pHigh: 28, kLow: 90, kHigh: 175 },
  sandy_low: { nLow: 14, nHigh: 40, pLow: 8, pHigh: 24, kLow: 70, kHigh: 150 },
};

function npkBandKey(texture: SoilTextureDef): 'rich_clay' | 'typical' | 'sandy_low' {
  if (texture.fieldCapacityPercent >= 29) return 'rich_clay';
  if (texture.fieldCapacityPercent <= 21) return 'sandy_low';
  return 'typical';
}

function buildNpk(farmId: string, crop: CropDef, texture: SoilTextureDef, irrigation: IrrigationDef): NpkReading {
  const band = NPK_BANDS[npkBandKey(texture)];
  const nitrogenPpm = Math.round(between(`sf:npk:${farmId}|n`, band.nLow - 8, band.nHigh + 6));
  const phosphorusPpm = Math.round(between(`sf:npk:${farmId}|p`, band.pLow - 6, band.pHigh + 9));
  const potassiumPpm = Math.round(between(`sf:npk:${farmId}|k`, band.kLow - 45, band.kHigh + 25));

  const shortfalls: string[] = [];
  if (nitrogenPpm < band.nLow) shortfalls.push(`ไนโตรเจน ${nitrogenPpm} ppm ต่ำกว่าเกณฑ์ ${band.nLow} ppm`);
  if (phosphorusPpm < band.pLow) shortfalls.push(`ฟอสฟอรัส ${phosphorusPpm} ppm ต่ำกว่าเกณฑ์ ${band.pLow} ppm`);
  if (potassiumPpm < band.kLow) shortfalls.push(`โพแทสเซียม ${potassiumPpm} ppm ต่ำกว่าเกณฑ์ ${band.kLow} ppm`);

  const excesses: string[] = [];
  if (nitrogenPpm > band.nHigh) excesses.push('ไนโตรเจนสูงเกิน');
  if (phosphorusPpm > band.pHigh) excesses.push('ฟอสฟอรัสสะสมมาก');
  if (potassiumPpm > band.kHigh) excesses.push('โพแทสเซียมสูงเกิน');

  const level: NpkReading['level'] = shortfalls.length > 0 ? 'low' : excesses.length > 0 ? 'high' : 'optimal';

  let advice: string;
  if (level === 'low') {
    const timing = irrigation.pressurized
      ? 'ละลายให้ไปพร้อมระบบน้ำ (fertigation) แบ่ง 2–3 รอบ เพื่อลดการชะล้าง'
      : 'ใส่แล้วพรวนกลบก่อนฝนรอบถัดไป หรือก่อนให้น้ำ 1 รอบ';
    advice = `ธาตุอาหารไม่พอ: ${shortfalls.join(' และ ')} — แนวทางสำหรับ${crop.name}: ${crop.fertilizerFormula} ${timing} และควรส่งตัวอย่างดินตรวจยืนยันก่อนปรับอัตราจริง`;
  } else if (level === 'high') {
    advice = `${excesses.join(' ')} — งดเพิ่มปุ๋ยเคมีในรอบนี้ โดยเฉพาะ${crop.name === 'ข้าวนาปี' || crop.name === 'ข้าวนาปรัง' ? 'ไนโตรเจนที่กระตุ้นให้ต้นข้าวล้มและเสี่ยงโรค' : 'โพแทสเซียมที่สะสมในดินเหนียว'} แล้วตรวจค่าใหม่หลังฝนรอบถัดไป`;
  } else {
    advice = `N/P/K อยู่ในช่วงเหมาะสม (${band.nLow}–${band.nHigh}/${band.pLow}–${band.pHigh}/${band.kLow}–${band.kHigh} ppm) — คงสูตร ${crop.fertilizerFormula} ตามรอบเดิม และตรวจซ้ำหลังฝนรอบถัดไป`;
  }

  return { nitrogenPpm, phosphorusPpm, potassiumPpm, level, advice };
}

/* ------------------------------------------------------------------ */
/* รอบน้ำ: สืบทอดจากตัวเลขความชื้น ฝน และ ET0 ของแปลงนั้นเอง             */
/* ------------------------------------------------------------------ */

interface IrrigationContext {
  crop: CropDef;
  texture: SoilTextureDef;
  irrigation: IrrigationDef;
  areaRai: number;
  gauge: number;
  status: MoistureStatus;
  vhc: number;
  fieldCapacity: number;
  wiltingPoint: number;
  waterHoldingBand: number;
  depletionLimitVhc: number;
  rain24Mm: number;
  et0TodayMm: number;
}

/**
 * กฎสืบทอด (ทำหน้าจอไม่สุ่ม):
 * 1) gauge > 100 (เหนือ field capacity)              → skip  ดินอิ่มตัว ระบายน้ำก่อน
 * 2) ฝน 24 ชม. >= rainSkipMm ของพืช && ไม่วิกฤต       → skip  ฝนทดแทนรอบแล้ว
 * 3) gauge >= targetGaugePercent (ถึงเป้าความชื้น)     → skip  ยังไม่ต้องเติม
 * 4) critical หรือ deficit ครึ่งล่างของช่วง            → now
 * 5) deficit / watch                                 → today
 * 6) adequate ที่ยังเติมได้อีก                        → scheduled ตามรอบปกติ
 * ทุกกรณีที่ไม่ใช่ skip จะมี recommendedWaterMm > 0 และ recommendedMinutes > 0 เสมอ
 */
function deriveIrrigation(ctx: IrrigationContext): NextIrrigationWindow {
  const { crop, gauge, status, irrigation } = ctx;

  const refillGauge = Math.max(0, Math.min(100, crop.targetGaugePercent - gauge));
  // เติม VWC ให้ขึ้น g จุดเปอร์เซ็นต์ ต้องใช้น้ำ g/100 × (FC−WP) × ความลึกเขตราก/100 (มม.)
  // และ 1 มม. ต่อ 1 ไร่ = 1.6 ลบ.ม.
  const rawWaterMm = (refillGauge / 100) * ctx.waterHoldingBand * (crop.rootDepthMm / 100) * 0.9;
  const waterMm = round(Math.min(crop.maxEventWaterMm, rawWaterMm), 1);
  const minutes = waterMm > 0
    ? Math.max(15, Math.ceil(((waterMm / irrigation.applicationRateMmPerHour) * 60) / 5) * 5)
    : 0;

  if (status === 'saturated') {
    return makeWindow('skip', ctx, 0, 0,
      `ความชื้นวัดได้ ${ctx.vhc}%VWC สูงกว่า field capacity ${ctx.fieldCapacity}% ของ${ctx.texture.label} ดินอิ่มตัวและระบายน้ำช้า จึงยังไม่ให้น้ำในรอบนี้ ให้ตรวจน้ำขังในร่องและระบบรากก่อน`);
  }
  if (rainCoversRound(ctx)) {
    return makeWindow('skip', ctx, 0, 0,
      `ฝนสะสม 24 ชั่วโมง ${ctx.rain24Mm} มม. สูงกว่าเกณฑ์ ${crop.rainSkipMm} มม. ของ${crop.name} ดินยังอยู่ที่ ${gauge}% ของช่วงจุดแห้งตาย–field capacity (${ctx.wiltingPoint}–${ctx.fieldCapacity}%) จึงงดรอบนี้แล้วตรวจค่าใหม่หลังฝนหยุด`);
  }
  if (waterMm <= 0) {
    return makeWindow('skip', ctx, 0, 0,
      `ความชื้น ${ctx.vhc}%VWC อยู่ที่ ${gauge}% ของช่วงน้ำที่พืชใช้ได้ ซึ่งถึงเป้า ${crop.targetGaugePercent}% ของ${crop.name} แล้ว ยังไม่ต้องเติมน้ำในรอบนี้ คงรอบตรวจค่าตามตารางปกติ`);
  }

  const deficitM3 = round(waterMm * 1.6 * ctx.areaRai, 0);

  if (status === 'critical' || (status === 'deficit' && gauge < (crop.criticalGaugePercent + crop.stressGaugePercent) / 2)) {
    return makeWindow('now', ctx, waterMm, minutes,
      `ความชื้นปัจจุบัน ${ctx.vhc}%VWC ต่ำกว่าจุดที่พืชเริ่มเครียด ${ctx.depletionLimitVhc}%VWC คงน้ำที่พืชใช้ได้เพียง ${gauge}% ของช่วง ${ctx.wiltingPoint}–${ctx.fieldCapacity}% (${crop.name} ถือว่าวิกฤตเมื่อต่ำกว่า ${crop.criticalGaugePercent}%) ต้องให้น้ำทันทีราว ${waterMm} มม. หรือประมาณ ${deficitM3} ลบ.ม. ทั้งแปลง มิฉะนั้น${crop.name}จะชะงักการเจริญเติบโต`);
  }
  if (status === 'deficit' || status === 'watch') {
    const tone = status === 'deficit'
      ? `ต่ำกว่าเกณฑ์เฝ้าระวังของ${crop.name} (${crop.stressGaugePercent}%)`
      : 'ยังอยู่เหนือจุดเครียดแต่กำลังลดลงตาม ET0';
    return makeWindow('today', ctx, waterMm, minutes,
      `ความชื้นอยู่ที่ ${gauge}% ของช่วงน้ำที่พืชใช้ได้ ${tone} ET0 วันนี้ ${ctx.et0TodayMm} มม. ควรวางรอบให้น้ำภายในวันนี้ช่วงแดดอ่อน ราว ${waterMm} มม. (${deficitM3} ลบ.ม.) และตรวจค่าซ้ำหลังให้น้ำ 2 ชั่วโมง`);
  }
  return makeWindow('scheduled', ctx, waterMm, minutes,
    `ความชื้น ${ctx.vhc}%VWC ยังอยู่กลางค่อนสูงของช่วงน้ำที่พืชใช้ได้ (${gauge}%) และฝน 24 ชม. ที่ผ่านมา ${ctx.rain24Mm} มม. ต่ำกว่าเกณฑ์ ${crop.rainSkipMm} มม. จึงให้ตามรอบปกติของ${crop.name} ปริมาณราว ${waterMm} มม. (${deficitM3} ลบ.ม.) ไม่ถือเป็นกรณีเร่งด่วน`);
}

function rainCoversRound(ctx: IrrigationContext): boolean {
  return ctx.rain24Mm >= ctx.crop.rainSkipMm && ctx.status !== 'critical';
}

interface WindowTiming {
  startMinutes: number;
  dayPrefix: string;
}

const WINDOW_TIMING: Record<IrrigationPriority, WindowTiming> = {
  now: { startMinutes: 6 * 60, dayPrefix: 'เช้าวันนี้' },
  today: { startMinutes: 17 * 60 + 30, dayPrefix: 'เย็นวันนี้' },
  scheduled: { startMinutes: 1440 + 6 * 60 + 30, dayPrefix: 'พรุ่งนี้เช้า' },
  skip: { startMinutes: 1440 + 7 * 60, dayPrefix: 'รอบถัดไป' },
};

function makeWindow(
  priority: IrrigationPriority,
  ctx: IrrigationContext,
  waterMm: number,
  minutes: number,
  reason: string,
): NextIrrigationWindow {
  const timing = WINDOW_TIMING[priority];
  const duration = minutes > 0 ? minutes : 90;
  const to = timing.startMinutes + duration;

  const label = priority === 'skip' && waterMm === 0
    ? `ยังไม่ให้น้ำในรอบนี้ (ตรวจค่าใหม่${timing.dayPrefix} ${clockLabel(timing.startMinutes)}–${clockLabel(to)} น.)`
    : `${timing.dayPrefix} ${clockLabel(timing.startMinutes)}–${clockLabel(to)} น.${minutes > 0 ? ` รอบ ${minutes} นาที` : ''}`;

  return {
    priority,
    from: isoAtBangkok(timing.startMinutes),
    to: isoAtBangkok(to),
    label,
    reason,
    recommendedMinutes: minutes,
    recommendedWaterMm: waterMm,
  };
}

/* ------------------------------------------------------------------ */
/* เครือข่ายเซนเซอร์ของแปลง                                              */
/* ------------------------------------------------------------------ */

type NodeValueSource =
  | 'soilShallow' | 'soilDeep' | 'airTemp' | 'humidity' | 'light'
  | 'rainfall' | 'nitrogen' | 'phosphorus' | 'potassium' | 'flow';

interface SensorPlanItem {
  kind: SensorKind;
  label: string;
  suffix: string;
  valueFrom: NodeValueSource;
}

function buildSensorPlan(irrigation: IrrigationDef, depths: [number, number]): SensorPlanItem[] {
  const plan: SensorPlanItem[] = [
    { kind: 'soil_moisture', label: `โพรบความชื้นดิน ชั้น ${depths[0]} ซม.`, suffix: 'soil-shallow', valueFrom: 'soilShallow' },
    { kind: 'soil_moisture', label: `โพรบความชื้นดิน ชั้น ${depths[1]} ซม.`, suffix: 'soil-deep', valueFrom: 'soilDeep' },
    { kind: 'air_temperature', label: 'อุณหภูมิอากาศระดับทรงพุ่ม', suffix: 'air-temp', valueFrom: 'airTemp' },
    { kind: 'relative_humidity', label: 'ความชื้นสัมพัทธ์ระดับทรงพุ่ม', suffix: 'air-rh', valueFrom: 'humidity' },
    { kind: 'par_light', label: 'เซนเซอร์แสง PAR ใต้ทรงพุ่ม', suffix: 'air-par', valueFrom: 'light' },
    { kind: 'rainfall', label: 'เครื่องวัดปริมาณน้ำฝนในแปลง', suffix: 'rain-gauge', valueFrom: 'rainfall' },
    { kind: 'npk', label: 'โพรบ N (ไนโตรเจน)', suffix: 'npk-nitrogen', valueFrom: 'nitrogen' },
    { kind: 'npk', label: 'โพรบ P (ฟอสฟอรัส)', suffix: 'npk-phosphorus', valueFrom: 'phosphorus' },
    { kind: 'npk', label: 'โพรบ K (โพแทสเซียม)', suffix: 'npk-potassium', valueFrom: 'potassium' },
  ];
  if (irrigation.pressurized) {
    plan.push({ kind: 'water_flow', label: `มิเตอร์อัตราการไหลฝั่ง${irrigation.label}`, suffix: 'flow-main', valueFrom: 'flow' });
  }
  return plan;
}

/** สถานะโหนดมาจาก seed ล้วน: offline ~5.5%, maintenance ~2%, low_battery ~6%, ที่เหลือ online */
function resolveNodeStatus(nodeId: string): SensorStatus {
  const roll = draw(`sf:sensor:${nodeId}:status`);
  if (roll < 0.055) return 'offline';
  if (roll < 0.075) return 'maintenance';
  if (roll < 0.135) return 'low_battery';
  return 'online';
}

function firmwareOf(kind: SensorKind, nodeId: string): string {
  return `v${FIRMWARE_MINOR[kind]}.${intBetween(`sf:sensor:${nodeId}:firmware`, 0, 9)}`;
}

interface NodeContext {
  irrigation: NextIrrigationWindow;
  series: HourSeries;
  npk: NpkReading;
  band: NpkBand;
  flowLpm: number;
  shallowVhc: number;
  deepVhc: number;
  depletionLimitVhc: number;
  fieldCapacity: number;
}

function buildSensors(farmId: string, provinceCode: string, plan: SensorPlanItem[], ctx: NodeContext): SensorNode[] {
  return plan.map((item) => {
    const nodeId = `${farmId}:${item.suffix}`;
    const status = resolveNodeStatus(nodeId);
    const reporting = status === 'online' || status === 'low_battery';
    const batteryPercent = Math.round(between(
      `sf:sensor:${nodeId}:battery`,
      status === 'low_battery' ? 4 : 26,
      status === 'low_battery' ? 19 : 99,
    ));
    const lastSeenMinutes = reporting
      ? SIM_NOW_MINUTES - intBetween(`sf:sensor:${nodeId}:hour`, 1, 28)
      : SIM_NOW_MINUTES - intBetween(`sf:sensor:${nodeId}:stale`, 200, 2400);

    const kindDef = KIND_DEFS[item.kind];
    let lowThreshold = kindDef.lowThreshold;
    let highThreshold = kindDef.highThreshold;
    if (item.kind === 'soil_moisture') {
      lowThreshold = item.valueFrom === 'soilShallow' ? ctx.depletionLimitVhc : round(ctx.depletionLimitVhc - 1.5, 1);
      highThreshold = ctx.fieldCapacity;
    }
    if (item.kind === 'npk') {
      lowThreshold = item.valueFrom === 'nitrogen' ? ctx.band.nLow : item.valueFrom === 'phosphorus' ? ctx.band.pLow : ctx.band.kLow;
      highThreshold = item.valueFrom === 'nitrogen' ? ctx.band.nHigh : item.valueFrom === 'phosphorus' ? ctx.band.pHigh : ctx.band.kHigh;
    }

    return {
      nodeId,
      farmId,
      provinceCode,
      kind: item.kind,
      label: item.label,
      status,
      batteryPercent,
      lastSeenAt: isoAtBangkok(lastSeenMinutes),
      firmware: firmwareOf(item.kind, nodeId),
      // โหนดที่ไม่รายงานค่าต้องเป็น null เสมอ (ห้ามใส่ 0 แทนค่าที่วัดไม่ได้)
      value: reporting ? round(rawValueOf(item.valueFrom, ctx), kindDef.decimals) : null,
      unit: kindDef.unit,
      lowThreshold,
      highThreshold,
    };
  });
}

function rawValueOf(source: NodeValueSource, ctx: NodeContext): number {
  switch (source) {
    case 'soilShallow': return ctx.shallowVhc;
    case 'soilDeep': return ctx.deepVhc;
    case 'airTemp': return ctx.series.temps[23];
    case 'humidity': return ctx.series.humidity[23];
    case 'light': return ctx.series.light[23];
    case 'rainfall': return ctx.series.rainTotalMm;
    case 'nitrogen': return ctx.npk.nitrogenPpm;
    case 'phosphorus': return ctx.npk.phosphorusPpm;
    case 'potassium': return ctx.npk.potassiumPpm;
    case 'flow': return ctx.irrigation.priority === 'skip' ? 0 : ctx.flowLpm;
  }
}

/* ------------------------------------------------------------------ */
/* ประกอบร่างหนึ่งแปลง                                                   */
/* ------------------------------------------------------------------ */

function buildFarm(provinceCode: string, provinceName: string, index: number): FarmPlot {
  const identity = buildIdentity(provinceCode, provinceName, index);
  const { crop, texture, irrigation } = identity;

  const fieldCapacity = round(texture.fieldCapacityPercent * (1 + crop.fcBias / 100), 1);
  const wiltingPoint = round(texture.wiltingPointPercent * (1 + crop.wpBias / 100), 1);
  const waterHoldingBand = round(fieldCapacity - wiltingPoint, 1);
  // จุดเครียด = เติมน้ำได้ไม่เกิน 50% ของช่วงน้ำที่พืชใช้ได้ (management allowable depletion แบบค่าเริ่มต้น)
  const depletionLimitVhc = round(wiltingPoint + 0.5 * waterHoldingBand, 1);

  const plan = buildRainPlan(identity.farmId, identity.regionKey);
  const series = buildHourSeries(identity.farmId, identity.regionKey, plan);
  const gauge = drawMoistureGauge(identity.farmId, identity.regionKey, plan.totalMm, crop);
  const vhc = round(wiltingPoint + (gauge / 100) * waterHoldingBand, 1);
  const status = classifyMoisture(gauge, crop);

  const depths: [number, number] = crop.rootDepthMm >= 700 ? [20, 40] : [15, 30];
  const microclimate = buildMicroclimate(series, crop, vhc, fieldCapacity, wiltingPoint);
  const et0TodayMm = round(microclimate.reduce((sum, hour) => sum + hour.et0Mm, 0), 1);

  const npk = buildNpk(identity.farmId, crop, texture, irrigation);
  const nextIrrigation = deriveIrrigation({
    crop, texture, irrigation,
    areaRai: identity.areaRai,
    gauge, status,
    vhc, fieldCapacity, wiltingPoint, waterHoldingBand, depletionLimitVhc,
    rain24Mm: plan.totalMm,
    et0TodayMm,
  });

  const flowLpm = round(
    irrigation.referenceFlowLpm * clamp(between(`sf:flow:${identity.farmId}`, 0.72, 1.28), 0.5, 1.6),
    1,
  );
  const band = NPK_BANDS[npkBandKey(texture)];
  const sensors = buildSensors(identity.farmId, identity.provinceCode, buildSensorPlan(irrigation, depths), {
    irrigation: nextIrrigation,
    series,
    npk,
    band,
    flowLpm,
    shallowVhc: vhc,
    deepVhc: round(clamp(vhc + between(`sf:soil:${identity.farmId}|deep`, 0.4, 2.6), 3, 45), 1),
    depletionLimitVhc,
    fieldCapacity,
  });

  const sensorOffline = sensors.filter((node) => node.status === 'offline' || node.status === 'maintenance').length;
  const plantStage = buildPlantStage(crop, identity.farmId);

  return {
    farmId: identity.farmId,
    farmName: identity.farmName,
    provinceCode: identity.provinceCode,
    provinceName: identity.provinceName,
    regionKey: identity.regionKey,
    regionLabel: REGION_LABEL[identity.regionKey],
    districtLabel: identity.districtLabel,
    farmType: identity.farmType,
    ownerAgency: identity.ownerAgency,
    cropId: crop.id,
    cropName: crop.name,
    plantDate: plantStage.plantDate,
    growthStage: plantStage.growthStage,
    areaRai: identity.areaRai,
    soilTexture: texture.label,
    irrigationSystem: irrigation.label,
    sensorTotal: sensors.length,
    sensorOnline: sensors.length - sensorOffline,
    sensorOffline,
    lowBatteryCount: sensors.filter((node) => node.status === 'low_battery').length,
    soilMoisturePercent: vhc,
    fieldCapacityPercent: fieldCapacity,
    wiltingPointPercent: wiltingPoint,
    availableWaterPercent: round(clamp((gauge / 100) * waterHoldingBand, 0, waterHoldingBand), 1),
    moistureStatus: status,
    // moistureGaugePercent คือตำแหน่ง 0–100 บนช่วง WP→FC เช่นกัน แต่ปัดเป็นจำนวนเต็มไว้ให้ gauge/UI
    moistureGaugePercent: clamp(gauge, 0, 100),
    et0TodayMm,
    npk,
    nextIrrigation,
    sensors,
    microclimate,
  };
}

/* ------------------------------------------------------------------ */
/* summary และ payload                                                  */
/* ------------------------------------------------------------------ */

function worstDeficitRegion(farms: FarmPlot[]): string {
  const counts = new Map<string, number>();
  for (const farm of farms) {
    if (farm.moistureStatus === 'critical' || farm.moistureStatus === 'deficit') {
      counts.set(farm.regionLabel, (counts.get(farm.regionLabel) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'th'),
  );
  if (ranked.length === 0) return 'ยังไม่พบภาคที่ความชื้นต่ำกว่าเกณฑ์เด่นชัด';
  const [regionLabel, regionCount] = ranked[0];
  return `${regionLabel} (${regionCount} แปลง)`;
}

function buildSummary(farms: FarmPlot[]): SmartFarmingSummary {
  const provinceCodes = new Set(farms.map((farm) => farm.provinceCode));
  const totalSensors = farms.reduce((sum, farm) => sum + farm.sensorTotal, 0);
  const onlineSensors = farms.reduce((sum, farm) => sum + farm.sensorOnline, 0);
  const offlineSensors = farms.reduce((sum, farm) => sum + farm.sensorOffline, 0);
  const lowBatterySensors = farms.reduce((sum, farm) => sum + farm.lowBatteryCount, 0);
  const nowCount = farms.filter((farm) => farm.nextIrrigation.priority === 'now').length;
  const todayCount = farms.filter((farm) => farm.nextIrrigation.priority === 'today').length;
  const skipCount = farms.filter((farm) => farm.nextIrrigation.priority === 'skip').length;
  const scheduledCount = farms.filter((farm) => farm.nextIrrigation.priority === 'scheduled').length;

  const avgVhc = round(farms.reduce((sum, farm) => sum + farm.soilMoisturePercent, 0) / farms.length, 1);
  const avgTemp = round(
    farms.reduce((sum, farm) => sum + farm.microclimate.reduce((acc, hour) => acc + hour.airTempC, 0) / 24, 0) / farms.length,
    1,
  );
  const avgEt0 = round(farms.reduce((sum, farm) => sum + farm.et0TodayMm, 0) / farms.length, 1);
  const totalArea = farms.reduce((sum, farm) => sum + farm.areaRai, 0);

  return {
    totalFarms: farms.length,
    totalProvinces: provinceCodes.size,
    totalSensors,
    onlineSensors,
    offlineSensors,
    lowBatterySensors,
    avgSoilMoisturePercent: avgVhc,
    avgAirTempC: avgTemp,
    avgEt0Mm: avgEt0,
    farmsNeedIrrigationNow: nowCount,
    farmsIrrigationToday: todayCount,
    farmsSkipIrrigation: skipCount,
    totalAreaRai: totalArea,
    coverageNote: COVERAGE_NOTE,
    headline:
      `${nowCount} แปลงต้องกลับเข้ารอบน้ำทันที อีก ${todayCount} แปลงควรวางรอบภายในวันนี้ `
      + `${scheduledCount} แปลงรอตามรอบปกติ และ ${skipCount} แปลงดรอบนี้ตามค่าความชื้นที่วัดได้`,
    subheadline:
      `ภาพรวม ${farms.length} แปลงสาธิตใน ${provinceCodes.size} จังหวัด (เป็นกลุ่มอ้างอิง ไม่ใช่ข้อสรุปว่าครอบคลุมจริง) `
      + `ความชื้นดินเฉลี่ย ${avgVhc}%VWC ET0 เฉลี่ย ${avgEt0} มม./วัน อุณหภูมิเฉลี่ยทรงพุ่ม ${avgTemp}°C `
      + `โซนที่ขาดน้ำเด่นที่สุดคือ ${worstDeficitRegion(farms)} `
      + `มี ${offlineSensors} โหนดไม่รายงานค่า (แสดงเป็น null) และ ${lowBatterySensors} โหนดแบตต่ำ`,
    sample: true,
    reportDate: REPORT_DATE,
  };
}

/* ------------------------------------------------------------------ */
/* Guard: สัญญาภายในต้องไม่แตก (fail closed แบบเดียวกับ livestock-data.ts) */
/* ------------------------------------------------------------------ */

function assertFarmsAreCoherent(farms: FarmPlot[]): void {
  const provinceCodes = new Set(farms.map((farm) => farm.provinceCode));
  if (provinceCodes.size !== 77) throw new Error('Smart farming must carry one plot group for all 77 provinces');
  if (farms.length < 90 || farms.length > 120) throw new Error('Smart farming plot count left the intended 90-120 demo range');
  if (new Set(farms.map((farm) => farm.farmId)).size !== farms.length) throw new Error('Duplicate farmId in smart farming registry');

  for (const farm of farms) {
    if (farm.microclimate.length !== 24) throw new Error(`Farm ${farm.farmId} must carry exactly 24 hourly rows`);
    if (farm.sensorOnline + farm.sensorOffline !== farm.sensorTotal) {
      throw new Error(`Farm ${farm.farmId}: sensorOnline + sensorOffline must equal sensorTotal`);
    }
    if (farm.sensors.length !== farm.sensorTotal) throw new Error(`Farm ${farm.farmId}: sensors array drifted from sensorTotal`);
    if (farm.moistureGaugePercent < 0 || farm.moistureGaugePercent > 100) throw new Error(`Farm ${farm.farmId}: gauge outside 0-100`);
    if (farm.wiltingPointPercent >= farm.fieldCapacityPercent) throw new Error(`Farm ${farm.farmId}: wilting point is not below field capacity`);
    if (farm.soilMoisturePercent !== farm.microclimate[23].soilMoisturePercent) {
      throw new Error(`Farm ${farm.farmId}: hourly series must end at the current soil moisture`);
    }
    const shallow = farm.sensors.find((node) => node.kind === 'soil_moisture');
    if (shallow && shallow.value !== null && Math.abs(shallow.value - farm.soilMoisturePercent) > 0.05) {
      throw new Error(`Farm ${farm.farmId}: shallow probe disagrees with soilMoisturePercent`);
    }
    if (farm.sensors.some((node) => (node.status === 'offline' || node.status === 'maintenance') && node.value !== null)) {
      throw new Error(`Farm ${farm.farmId}: non-reporting node must keep value = null`);
    }
    if (farm.nextIrrigation.priority !== 'skip' && farm.nextIrrigation.recommendedMinutes <= 0) {
      throw new Error(`Farm ${farm.farmId}: irrigation window without a run duration`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* การประกอบ payload (build ครั้งเดียว memoize ต่อ process)             */
/* ------------------------------------------------------------------ */

function loadDashboard(provinces: { code: string; name: string }[]): SmartFarmingDashboardPayload {
  const farms: FarmPlot[] = [];
  for (const province of provinces) {
    const extras = EXTRA_FARM_BY_PROVINCE[province.code] ?? 0;
    for (let index = 0; index < extras + 1; index += 1) {
      farms.push(buildFarm(province.code, province.name, index));
    }
  }
  assertFarmsAreCoherent(farms);

  const farmCountByProvince = new Map<string, number>();
  const farmCountByCrop = new Map<string, number>();
  for (const farm of farms) {
    farmCountByProvince.set(farm.provinceCode, (farmCountByProvince.get(farm.provinceCode) ?? 0) + 1);
    farmCountByCrop.set(farm.cropId, (farmCountByCrop.get(farm.cropId) ?? 0) + 1);
  }

  const provinceOptions: SmartFarmingProvinceOption[] = provinces
    .map((province) => {
      const regionKey = REGION_BY_PROVINCE[province.code];
      return {
        code: province.code,
        name: province.name,
        regionKey,
        regionLabel: REGION_LABEL[regionKey],
        farmCount: farmCountByProvince.get(province.code) ?? 0,
      };
    })
    .sort((left, right) => Number(left.code) - Number(right.code));

  const cropOptions: SmartFarmingCropOption[] = CROPS
    .filter((crop) => (farmCountByCrop.get(crop.id) ?? 0) > 0)
    .map((crop) => ({ id: crop.id, name: crop.name, farmCount: farmCountByCrop.get(crop.id) ?? 0 }))
    .sort((left, right) => right.farmCount - left.farmCount || left.name.localeCompare(right.name, 'th'));

  return {
    generatedAt: SMART_FARMING_GOVERNANCE.updatedAt,
    sample: true,
    access: 'metadata_only',
    bannerText: SMART_FARMING_GOVERNANCE.bannerText,
    disclaimer: SMART_FARMING_GOVERNANCE.disclaimer,
    summary: buildSummary(farms),
    farms,
    provinces: provinceOptions,
    crops: cropOptions,
    sources: SOURCES,
    warnings: WARNINGS,
    gaps: GAPS,
  };
}

/**
 * ทะเบียนจังหวัด 77 รายการอ่านแบบ async (data/provinces.csv หรือ embedded fallback)
 * memoize ไว้ตัวเดียว เพื่อให้ทั้งสามฟังก์ชัน public ใช้ชุดค่าเดียวกันทุก request
 */
let dashboardPromise: Promise<SmartFarmingDashboardPayload> | undefined;

async function loadDashboardAsync(): Promise<SmartFarmingDashboardPayload> {
  const provinces = await getProvinces();
  if (provinces.length !== 77) throw new Error('Smart farming expects the full 77-province registry');
  return loadDashboard(provinces.map((province) => ({ code: province.code, name: province.name })));
}

function getDashboard(): Promise<SmartFarmingDashboardPayload> {
  dashboardPromise ??= loadDashboardAsync();
  return dashboardPromise;
}

/* ------------------------------------------------------------------ */
/* ตัวกรอง                                                              */
/* ------------------------------------------------------------------ */

function matchesFarm(farm: FarmPlot, options: FarmFilterOptions): boolean {
  if (options.provinceCode && farm.provinceCode !== options.provinceCode) return false;
  if (options.cropId && farm.cropId !== options.cropId) return false;
  if (options.moistureStatus && farm.moistureStatus !== options.moistureStatus) return false;

  if (options.sensorState && options.sensorState !== 'all') {
    // หมายความว่า "แปลงนั้นมีโหนดอย่างน้อยหนึ่งตัวในสถานะนี้" ไม่ใช่ "ทุกโหนดอยู่ในสถานะนี้"
    if (options.sensorState === 'online' && farm.sensorOnline === 0) return false;
    if (options.sensorState === 'offline' && farm.sensorOffline === 0) return false;
    if (options.sensorState === 'low_battery' && farm.lowBatteryCount === 0) return false;
  }

  const query = options.query?.normalize('NFC').trim().toLowerCase();
  if (query) {
    const haystack = [
      farm.farmName, farm.farmId, farm.provinceName, farm.provinceCode, farm.regionLabel,
      farm.districtLabel, farm.cropName, farm.cropId, farm.ownerAgency, farm.soilTexture,
      farm.irrigationSystem, farm.growthStage, farm.moistureStatus, farm.nextIrrigation.priority,
    ].join(' ').normalize('NFC').toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Public API ของ lane 4A (สัญญาเดียวกับที่หน้า /smart-farming ใช้)      */
/* ------------------------------------------------------------------ */

/**
 * payload ทั้งชุด: summary + farms (พร้อม sensors และ microclimate ครบ 24 ชั่วโมง)
 * generatedAt เป็นค่าคงที่ SMART_FARMING_GOVERNANCE.updatedAt ไม่ใช่ clock จริง
 */
export async function buildSmartFarmingDashboard(): Promise<SmartFarmingDashboardPayload> {
  return getDashboard();
}

/** รายการแปลงที่ผ่านตัวกรอง (ข้อมูลชั้นDetail ครบ; ไม่ตรงเงื่อนไขคืน [] ไม่ใช่ค่าตกค้าง) */
export async function getSmartFarmingFarms(options?: FarmFilterOptions): Promise<FarmPlot[]> {
  const payload = await getDashboard();
  if (!options) return payload.farms;
  return payload.farms.filter((farm) => matchesFarm(farm, options));
}

export async function getSmartFarmingSummary(): Promise<SmartFarmingSummary> {
  const payload = await getDashboard();
  return payload.summary;
}
