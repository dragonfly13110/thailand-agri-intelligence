/**
 * Early-warning dashboard data.
 *
 * Two modes, never mixed in one payload:
 *
 * 1) `real_evidence` — `buildEarlyWarningDataset()` reads the published numeric
 *    batches of the hub and turns them into risk signals:
 *    - RID medium-reservoir daily report (`readWaterSnapshot`) for reservoir
 *      storage percent,
 *    - the GISTDA 7-day flood polygons (`satellite-data`) for inundated and
 *      rice area per DOPA province,
 *    - TMD station observations (`readWeatherSnapshot`) for daily rainfall and
 *      maximum temperature.
 *    The measured values are the source's own; the risk level, the score and
 *    the advisory are the TADIH internal index computed here, so the payload
 *    always carries the "not an official disaster declaration" disclaimer.
 * 2) `simulation_fallback` — when no numeric batch can be read (no D1 binding,
 *    offline test run) the module returns the deterministic synthetic universe
 *    below: reservoir rows are generated from a seeded hash and carry synthetic
 *    names/IDs, `sample` stays `true` and the envelope stays `metadata_only`.
 *
 * The forward 14-day timeline has no approved forecast resource in either mode
 * and is always labelled as the simulation layer.
 */

import type { ApiMeta, Completeness, Freshness } from './types';
import { readWaterSnapshot } from './water-repository';
import { readWeatherSnapshot } from './weather-repository';

export type DisasterAlertLevel = 'critical' | 'warning' | 'normal';
export type RiskType = 'flood' | 'drought' | 'all';
export type RiskSignalSourceId = 'rid' | 'gistda' | 'tmd';
export type RiskHazard = 'flood' | 'drought' | 'heat';

export interface EarlyWarningSummary {
  totalReservoirs: number;
  criticalFloodCount: number; // >80%
  criticalDroughtCount: number; // <30%
  safeReservoirsCount: number; // 30-80%
  highRiskProvincesCount: number;
  warningProvincesCount: number;
  normalProvincesCount: number;
  /** `null` when no station with a confirmed unit reported rainfall — missing is never 0 mm. */
  avgRainfall7dMm: number | null;
  maxRainfall7dMm: number | null;
  /** States the grain the two rainfall figures came from, so a station value is never read as a province value. */
  rainfallBasis: string;
  disasterAlertLevel: DisasterAlertLevel;
  headline: string;
  subheadline: string;
  sample: boolean;
  reportDate: string;
}

export interface ProvinceRiskItem {
  provinceCode: string;
  provinceName: string;
  region: string;
  basinName: string;
  overallRisk: DisasterAlertLevel;
  floodRiskScore: number | null; // 0-100; null when flood evidence is absent
  floodRiskLevel: DisasterAlertLevel | null;
  /** `null` when no drought input backs this province — unknown is never 0/normal. */
  droughtRiskScore: number | null; // 0-100
  droughtRiskLevel: DisasterAlertLevel | null;
  /** Heat severity from TMD station maxima; `null` when no confirmed heat signal exists. */
  heatRiskScore?: number | null;
  heatRiskLevel?: DisasterAlertLevel | null;
  /** `null` when no published observation backs the figure — missing is never 0. */
  rainfall7dMm: number | null;
  soilMoisturePercent: number | null; // %
  reservoirStoragePercent: number | null;
  affectedCrops: string[];
  agriculturalAdvisory: string;
  recommendedActions: string[];
  urgency: 'urgent' | 'warning' | 'watch';
  keyReservoirs: string[];
  /** Real-evidence mode only: the ids of the `RiskAlertItem`s behind this row. */
  signalIds?: string[];
  /** Which measured layers actually contributed to this row. */
  evidenceSources?: RiskSignalSourceId[];
  /** States the grain/unit basis of `rainfall7dMm` so a station value is never read as a province value. */
  rainfallBasis?: string | null;
  /** States which input fed the drought index, including "no provincial input". */
  droughtBasis?: string | null;
  /** Observation timestamp of the evidence that produced this row. */
  observedAt?: string | null;
  /** `true` when the row is driven by published measurements instead of the simulation. */
  observed?: boolean;
}

export interface SimulationForecastDay {
  day: number;
  date: string;
  dayLabel: string;
  rainfallAvgMm: number;
  inflowForecastMcm: number;
  floodProbability: number; // %
  droughtProbability: number; // %
  riskTrend: 'increasing' | 'stable' | 'decreasing';
  activeFront: string;
  advisoryHeadline: string;
}

export interface CriticalReservoir {
  id: string;
  name: string;
  region: string | null;
  /** Design capacity is not in the published RID numeric layer — `null`, never 0. */
  storage: number | null;
  volume: number | null;
  percent: number | null;
  deadStorage: number | null;
  /** The source does not publish a unit for these, so they stay unpublished. */
  inflow: number | null;
  outflow: number | null;
  type: 'overflow' | 'drought';
  riskLabel: string;
  advisoryNote: string;
  /** Real-evidence mode only. */
  sourceId?: RiskSignalSourceId | null;
  sourceBadge?: string | null;
  sourceName?: string | null;
  observedAt?: string | null;
  volumeUnit?: string | null;
  capacityStatus?: string | null;
  runId?: string | null;
  sourceRowRef?: string | null;
}

export const SAMPLE_GOVERNANCE = {
  sample: true,
  access: 'metadata_only' as const,
  version: '2026.10-ew-sim-v2',
  bannerText: 'ข้อมูลจำลองเพื่อการสาธิตระบบเตือนภัยล่วงหน้า (Simulation only)',
  disclaimer:
    'แบบจำลองการเตือนภัยล่วงหน้าน้ำท่วม/ภัยแล้งฉับพลันและดัชนีความเสี่ยงรายลุ่มน้ำ-จังหวัดนี้ เป็นชุดข้อมูลสังเคราะห์เชิงโครงสร้าง (Deterministic Simulation) เพื่อสาธิตสถาปัตยกรรม Decision Intelligence Hub เท่านั้น ไม่ได้ใช้ค่าจริงจากรายงานอ่างเก็บน้ำของกรมชลประทานหรือข้อมูลใดที่สิทธิ์ยัง pending และไม่ใช่การพยากรณ์ที่เผยแพร่แล้ว',
  updatedAt: '2026-10-25T08:30:00+07:00',
};

/**
 * 28 ตัวแทนจังหวัดเกษตรกรรมสำคัญครอบคลุม 6 ภูมิภาคและทุกลุ่มน้ำหลัก
 * พร้อมดัชนีจำลองเชิงกายภาพและคำแนะนำทาง agronomy ที่สอดคล้องกับพืชเศรษฐกิจ
 */
export const PROVINCIAL_RISK_DATA: ProvinceRiskItem[] = [
  // --- ภาคเหนือ ---
  {
    provinceCode: '50',
    provinceName: 'เชียงใหม่',
    region: 'ภาคเหนือ',
    basinName: 'ลุ่มน้ำปิง',
    overallRisk: 'warning',
    floodRiskScore: 68,
    floodRiskLevel: 'warning',
    droughtRiskScore: 24,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 98.4,
    soilMoisturePercent: 82,
    reservoirStoragePercent: 78.4,
    affectedCrops: ['ข้าวนาปี (ระยะน้ำนม)', 'ลำไย', 'ผักเมืองหนาว'],
    agriculturalAdvisory: 'เฝ้าระวังน้ำป่าไหลหลากในพื้นที่ลุ่มต่ำริมแม่น้ำปิง เร่งขุดลอกทางระบายน้ำในสวนผลไม้',
    recommendedActions: [
      'ตรวจสอบคันคูแปลงนาข้าวและคูระบายน้ำรอบสวนลำไย',
      'ชะลอการหว่านเมล็ดพันธุ์ผักแปลงเปิดช่วง 3 วันนี้',
      'ยกมอเตอร์สูบน้ำและอุปกรณ์เกษตรขึ้นที่ดอน',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง เชียงใหม่ 1', 'อ่างเก็บน้ำจำลอง เชียงใหม่ 2'],
  },
  {
    provinceCode: '57',
    provinceName: 'เชียงราย',
    region: 'ภาคเหนือ',
    basinName: 'ลุ่มน้ำกก - สาย',
    overallRisk: 'critical',
    floodRiskScore: 88,
    floodRiskLevel: 'critical',
    droughtRiskScore: 12,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 164.2,
    soilMoisturePercent: 94,
    reservoirStoragePercent: 91.5,
    affectedCrops: ['ข้าวหอมมะลิ', 'ข้าวโพดเลี้ยงสัตว์', 'ชา/กาแฟ'],
    agriculturalAdvisory: 'วิกฤติน้ำหลากฉับพลัน ดินชุ่มน้ำสูงสุดเสี่ยงดินโคลนถล่มและน้ำท่วมขังพื้นที่เกษตรราบลุ่ม',
    recommendedActions: [
      'เปิดช่องทางระบายน้ำออกจากแปลงนาเพื่อป้องกันรวงข้าวเน่าเสียหาย',
      'สำรวจเสถียรภาพดินบริเวณแปลงเกษตรขั้นบันไดและไหล่เขา',
      'เคลื่อนย้ายปศุสัตว์และปัจจัยการผลิตขึ้นศูนย์พักพิงสัตว์ฉุกเฉิน',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง เชียงราย 1', 'อ่างเก็บน้ำจำลอง เชียงราย 2'],
  },
  {
    provinceCode: '55',
    provinceName: 'น่าน',
    region: 'ภาคเหนือ',
    basinName: 'ลุ่มน้ำน่านตอนบน',
    overallRisk: 'warning',
    floodRiskScore: 74,
    floodRiskLevel: 'warning',
    droughtRiskScore: 18,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 112.0,
    soilMoisturePercent: 86,
    reservoirStoragePercent: 83.0,
    affectedCrops: ['ข้าวไร่', 'ข้าวโพด', 'ยางพารา'],
    agriculturalAdvisory: 'ปริมาณน้ำท่าต้นน้ำสูงขึ้นต่อเนื่อง ให้เฝ้าระวังน้ำตลิ่งเอ่อท่วมแปลงเกษตรริมลำน้ำ',
    recommendedActions: [
      'เตรียมเครื่องสูบน้ำประจำจุดเสี่ยงน้ำท่วมขัง',
      'งดฉีดพ่นสารเคมีและใส่ปุ๋ยก่อนฝนตกหนักชะล้าง',
      'บันทึกพิกัดแปลงเสี่ยงเพื่อขอรับเงินเยียวยาหากเกิดอุทกภัย',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง น่าน 1', 'อ่างเก็บน้ำจำลอง น่าน 2'],
  },
  {
    provinceCode: '64',
    provinceName: 'สุโขทัย',
    region: 'ภาคเหนือ',
    basinName: 'ลุ่มน้ำยม',
    overallRisk: 'critical',
    floodRiskScore: 92,
    floodRiskLevel: 'critical',
    droughtRiskScore: 10,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 178.5,
    soilMoisturePercent: 96,
    reservoirStoragePercent: 95.0,
    affectedCrops: ['ข้าวนาปี (เก็บเกี่ยว)', 'อ้อยโรงงาน', 'กล้วยตาก'],
    agriculturalAdvisory: 'ระดับน้ำแม่น้ำยมล้นตลิ่ง คันกั้นน้ำดินมีความเสี่ยงพังทลาย ให้เร่งระบายน้ำออกจากพื้นที่แก้มลิง',
    recommendedActions: [
      'เร่งเกี่ยวข้าวในแปลงที่สุกแก่ทันทีแบบหนีน้ำ',
      'เปิดบานระบายน้ำคลองหกบาทเพื่อผันน้ำเลี่ยงพื้นที่ชุมชนและนาข้าว',
      'อพยพเครื่องจักรกลเกษตรออกจากทุ่งรับน้ำบางระกำโมเดล',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง สุโขทัย 1', 'อ่างเก็บน้ำจำลอง สุโขทัย 2'],
  },
  {
    provinceCode: '65',
    provinceName: 'พิษณุโลก',
    region: 'ภาคเหนือ',
    basinName: 'ลุ่มน้ำยม - น่าน',
    overallRisk: 'critical',
    floodRiskScore: 86,
    floodRiskLevel: 'critical',
    droughtRiskScore: 14,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 145.0,
    soilMoisturePercent: 91,
    reservoirStoragePercent: 88.7,
    affectedCrops: ['ข้าวนาปี', 'มะม่วงน้ำดอกไม้สีทอง', 'ข้าวโพด'],
    agriculturalAdvisory: 'น้ำหลากจากสุโขทัยไหลลงสู่ทุ่งบางระกำ ให้เกษตรกรเฝ้าระวังระดับน้ำขังสูงเกิน 1.5 เมตร',
    recommendedActions: [
      'ประสานงานชลประทานปิด-เปิดประตูระบายน้ำตามรอบเวร',
      'เสริมกระสอบทรายคันคูคันล้อมสวนมะม่วง',
      'ป้องกันโรครากเน่าโคนเน่าในไม้ผลยืนต้น',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง พิษณุโลก 1', 'อ่างเก็บน้ำจำลอง พิษณุโลก 2'],
  },
  {
    provinceCode: '52',
    provinceName: 'ลำปาง',
    region: 'ภาคเหนือ',
    basinName: 'ลุ่มน้ำวัง',
    overallRisk: 'normal',
    floodRiskScore: 42,
    floodRiskLevel: 'normal',
    droughtRiskScore: 35,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 48.2,
    soilMoisturePercent: 62,
    reservoirStoragePercent: 65.3,
    affectedCrops: ['ข้าวนาปี', 'สับปะรด', 'กระเทียม'],
    agriculturalAdvisory: 'สภาพน้ำอยู่ในเกณฑ์สมดุล เหมาะสมต่อการบำรุงรักษาแปลงนาข้าวและเตรียมดินปลูกพืชฤดูแล้ง',
    recommendedActions: [
      'กักเก็บน้ำในสระประจำไร่นาเพื่อใช้ช่วงแล้งปลายปี',
      'ตรวจเช็กระบบน้ำหยดในแปลงพืชสวน',
    ],
    urgency: 'watch',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ลำปาง 1', 'อ่างเก็บน้ำจำลอง ลำปาง 2'],
  },

  // --- ภาคกลาง ---
  {
    provinceCode: '14',
    provinceName: 'พระนครศรีอยุธยา',
    region: 'ภาคกลาง',
    basinName: 'ลุ่มน้ำเจ้าพระยา - ป่าสัก',
    overallRisk: 'critical',
    floodRiskScore: 95,
    floodRiskLevel: 'critical',
    droughtRiskScore: 8,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 188.0,
    soilMoisturePercent: 98,
    reservoirStoragePercent: 94.2,
    affectedCrops: ['ข้าวนาปี', 'บัวหลวง', 'พืชผักสวนครัว'],
    agriculturalAdvisory: 'เขื่อนเจ้าพระยาระบายน้ำแตะระดับ 2,200 ลบ.ม./วินาที น้ำนอกคันกั้นน้ำท่วมเต็มพื้นที่ ให้เร่งสูบระบาย',
    recommendedActions: [
      'เดินเครื่องสูบน้ำสถานีปลายคลองลงสู่แม่น้ำเจ้าพระยาตลอด 24 ชม.',
      'งดหว่านข้าวรุ่นใหม่เด็ดขาดจนกว่าระดับน้ำจะลดสู่ภาวะปกติ',
      'จัดตั้งจุดรวมเครื่องมือเกษตรและกระสอบทรายป้องกันคันดิน',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง พระนครศรีอยุธยา 1', 'อ่างเก็บน้ำจำลอง พระนครศรีอยุธยา 2'],
  },
  {
    provinceCode: '72',
    provinceName: 'สุพรรณบุรี',
    region: 'ภาคกลาง',
    basinName: 'ลุ่มน้ำท่าจีน',
    overallRisk: 'warning',
    floodRiskScore: 78,
    floodRiskLevel: 'warning',
    droughtRiskScore: 16,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 122.4,
    soilMoisturePercent: 88,
    reservoirStoragePercent: 82.5,
    affectedCrops: ['ข้าวนาปี', 'แห้วสุพรรณ', 'อ้อย'],
    agriculturalAdvisory: 'แม่น้ำท่าจีนระบายน้ำออกสู่อ่าวไทยช้าช่วงน้ำทะเลหนุนสูง เฝ้าระวังแปลงแห้วและนาข้าวริมคลองสาลี',
    recommendedActions: [
      'ปิดประตูน้ำระบายช่วงน้ำทะเลหนุน และเปิดระบายช่วงน้ำลง',
      'เฝ้าระวังโรคไหม้และโรคขอบใบแห้งในนาข้าวที่ชื้นแฉะ',
      'เตรียมเรือท้องแบนสำหรับลำเลียงผลผลิต',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง สุพรรณบุรี 1', 'อ่างเก็บน้ำจำลอง สุพรรณบุรี 2'],
  },
  {
    provinceCode: '60',
    provinceName: 'นครสวรรค์',
    region: 'ภาคกลาง',
    basinName: 'ลุ่มน้ำเจ้าพระยา (ปากน้ำโพ)',
    overallRisk: 'critical',
    floodRiskScore: 89,
    floodRiskLevel: 'critical',
    droughtRiskScore: 11,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 152.0,
    soilMoisturePercent: 92,
    reservoirStoragePercent: 89.0,
    affectedCrops: ['ข้าวนาปี', 'มันสำปะหลัง', 'อ้อย'],
    agriculturalAdvisory: 'จุดบรรจบแม่น้ำปิงและยม-น่าน ปริมาณน้ำท่าสะสมไหลหลากเข้าทุ่งชุมแสงและเก้าเลี้ยวอย่างรวดเร็ว',
    recommendedActions: [
      'เฝ้าระวังคันดินกั้นน้ำทุ่งบอระเพ็ด',
      'สูบระบายน้ำออกจากแปลงมันสำปะหลังเพื่อกันหัวเน่า',
      'ประสานจัดหาสารชีวภัณฑ์ฆ่าเชื้อราหลังน้ำลด',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง นครสวรรค์ 1', 'อ่างเก็บน้ำจำลอง นครสวรรค์ 2'],
  },
  {
    provinceCode: '18',
    provinceName: 'ชัยนาท',
    region: 'ภาคกลาง',
    basinName: 'ลุ่มน้ำเจ้าพระยา',
    overallRisk: 'critical',
    floodRiskScore: 90,
    floodRiskLevel: 'critical',
    droughtRiskScore: 10,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 160.5,
    soilMoisturePercent: 93,
    reservoirStoragePercent: 91.2,
    affectedCrops: ['ส้มโอขาวแตงกวา', 'ข้าวนาปี', 'ข้าวโพด'],
    agriculturalAdvisory: 'พื้นที่เหนือเขื่อนเจ้าพระยามีปริมาณน้ำสะสมสูง ให้สวนส้มโอขาวแตงกวาเร่งคันกั้นน้ำล้อมสวน',
    recommendedActions: [
      'เสริมกระสอบทรายรอบโคนต้นส้มโอเพื่อป้องกันน้ำท่วมขังเกิน 7 วัน',
      'สูบน้ำออกจากร่องสวนตลอดช่วงฝนตกชุก',
      'ตัดแต่งกิ่งลดแรงต้านลมพายุ',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ชัยนาท 1', 'อ่างเก็บน้ำจำลอง ชัยนาท 2'],
  },
  {
    provinceCode: '16',
    provinceName: 'ลพบุรี',
    region: 'ภาคกลาง',
    basinName: 'ลุ่มน้ำป่าสัก',
    overallRisk: 'warning',
    floodRiskScore: 72,
    floodRiskLevel: 'warning',
    droughtRiskScore: 20,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 104.6,
    soilMoisturePercent: 81,
    reservoirStoragePercent: 86.4,
    affectedCrops: ['ข้าวโพดเลี้ยงสัตว์', 'ทานตะวัน', 'อ้อยโรงงาน'],
    agriculturalAdvisory: 'น้ำป่าจากเทือกเขาเพชรบูรณ์ไหลลงเขื่อนป่าสักฯ ให้เฝ้าระวังพื้นที่ราบต่ำริมแม่น้ำป่าสัก',
    recommendedActions: [
      'ขุดร่องระบายน้ำแปลงข้าวโพดเลี้ยงสัตว์',
      'ชะลอการหยอดเมล็ดทานตะวันจนกว่าดินจะหมาดระบายน้ำได้ดี',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ลพบุรี 1', 'อ่างเก็บน้ำจำลอง ลพบุรี 2'],
  },
  {
    provinceCode: '13',
    provinceName: 'ปทุมธานี',
    region: 'ภาคกลาง',
    basinName: 'ลุ่มน้ำเจ้าพระยาตอนล่าง',
    overallRisk: 'warning',
    floodRiskScore: 76,
    floodRiskLevel: 'warning',
    droughtRiskScore: 9,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 135.2,
    soilMoisturePercent: 89,
    reservoirStoragePercent: 83.0,
    affectedCrops: ['กล้วยไม้', 'ข้าวนาปี', 'บัวตัดดอก'],
    agriculturalAdvisory: 'เฝ้าระวังน้ำทะเลหนุนร่วมกับน้ำเหนือหลาก กระทบสวนกล้วยไม้และแปลงบัวตามแนวคลองระพีพัฒน์',
    recommendedActions: [
      'ตรวจสอบเครื่องสูบน้ำไฟฟ้าประจำสวนกล้วยไม้',
      'ยกโรงเรือนกล้วยไม้และแผงปลูกให้พ้นแนวน้ำท่วมสูงสุด',
      'ควบคุมคุณภาพน้ำไม่ให้ค่าความเค็มปนเปื้อนในระบบรดน้ำ',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ปทุมธานี 1', 'อ่างเก็บน้ำจำลอง ปทุมธานี 2'],
  },

  // --- ภาคตะวันออกเฉียงเหนือ ---
  {
    provinceCode: '34',
    provinceName: 'อุบลราชธานี',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำมูล - ชี ตอนล่าง',
    overallRisk: 'critical',
    floodRiskScore: 94,
    floodRiskLevel: 'critical',
    droughtRiskScore: 8,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 195.4,
    soilMoisturePercent: 97,
    reservoirStoragePercent: 96.1,
    affectedCrops: ['ข้าวหอมมะลิทุ่งกุลา', 'มันสำปะหลัง', 'ยางพารา'],
    agriculturalAdvisory: 'จุดบรรจบแม่น้ำชีและแม่น้ำมูลที่สะพานเสรีประชาธิปไตย น้ำเอ่อท่วมชุมชนและพื้นที่เกษตรลุ่มต่ำวิกฤติ',
    recommendedActions: [
      'เปิดผลักดันน้ำสะพานข้ามแม่น้ำมูลลงแม่น้ำโขงเต็มกำลัง',
      'เร่งอพยพสัตว์เลี้ยง โค กระบือ ไปยังศูนย์อพยพดอนสูง',
      'ห้ามฉีดพ่นสารเคมีแปลงเกษตรริมตลิ่งเด็ดขาด',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง อุบลราชธานี 1', 'อ่างเก็บน้ำจำลอง อุบลราชธานี 2'],
  },
  {
    provinceCode: '40',
    provinceName: 'ขอนแก่น',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำชีตอนกลาง',
    overallRisk: 'warning',
    floodRiskScore: 75,
    floodRiskLevel: 'warning',
    droughtRiskScore: 22,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 108.5,
    soilMoisturePercent: 83,
    reservoirStoragePercent: 84.7,
    affectedCrops: ['ข้าวนาปี', 'อ้อยคั้นน้ำ/อ้อยโรงงาน', 'มันสำปะหลัง'],
    agriculturalAdvisory: 'ลำน้ำชีระดับน้ำทรงตัวสูง มีน้ำเอ่อล้นตามรอยฟันปลาคันกั้นน้ำเข้าทุ่งนาเขตมัญจาคีรีและโคกโพธิ์ไชย',
    recommendedActions: [
      'ตรวจสอบประตูระบายน้ำลำห้วยสาขาของลำน้ำชี',
      'ขุดร่องชักน้ำในแปลงมันสำปะหลังไม่ให้เกิดน้ำขังรากเน่า',
      'เร่งเก็บเกี่ยวพืชอายุสั้นรอบแปลง',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ขอนแก่น 1', 'อ่างเก็บน้ำจำลอง ขอนแก่น 2'],
  },
  {
    provinceCode: '30',
    provinceName: 'นครราชสีมา',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำมูลตอนบน',
    overallRisk: 'warning',
    floodRiskScore: 69,
    floodRiskLevel: 'warning',
    droughtRiskScore: 28,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 92.4,
    soilMoisturePercent: 78,
    reservoirStoragePercent: 79.5,
    affectedCrops: ['ข้าวโพดเลี้ยงสัตว์', 'มันสำปะหลัง', 'น้อยหน่าปากช่อง'],
    agriculturalAdvisory: 'น้ำป่าไหลหลากจากอุทยานฯ เขาใหญ่และทับลาน ให้เฝ้าระวังพื้นที่ลุ่มน้ำลำตะคองและลำเชียงไกร',
    recommendedActions: [
      'ปิดประตูน้ำย่อยเพื่อกักเก็บน้ำไว้ใช้หน้าแล้ง แต่เปิดทางน้ำล้นฉุกเฉิน',
      'ดูแลคอกโคเนื้อ-โคนมไม่ให้เปียกชื้น ป้องกันโรคลมบวมและปากเท้าเปื่อย',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง นครราชสีมา 1', 'อ่างเก็บน้ำจำลอง นครราชสีมา 2'],
  },
  {
    provinceCode: '45',
    provinceName: 'ร้อยเอ็ด',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำชี - ทุ่งกุลาร้องไห้',
    overallRisk: 'critical',
    floodRiskScore: 88,
    floodRiskLevel: 'critical',
    droughtRiskScore: 15,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 156.0,
    soilMoisturePercent: 93,
    reservoirStoragePercent: 89.4,
    affectedCrops: ['ข้าวหอมมะลิ GI ทุ่งกุลา', 'แตงโม', 'พริก'],
    agriculturalAdvisory: 'น้ำจากลำน้ำชีเอ่อท่วมขังทุ่งกุลาร้องไห้ในระดับสูง กระทบข้าวหอมมะลิระยะแตกรวง',
    recommendedActions: [
      'ระดมเครื่องสูบน้ำแรงดันสูงผลักน้ำลงสู่แม่น้ำมูล',
      'ทำแนวคันดินชั่วคราวเพื่อปกป้องแปลงเมล็ดพันธุ์ข้าวบริสุทธิ์',
      'สำรวจความเสียหายเพื่อเตรียมขอสนับสนุนเมล็ดพันธุ์สำรอง',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ร้อยเอ็ด 1', 'อ่างเก็บน้ำจำลอง ร้อยเอ็ด 2'],
  },
  {
    provinceCode: '32',
    provinceName: 'สุรินทร์',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำมูลตอนล่าง',
    overallRisk: 'normal',
    floodRiskScore: 48,
    floodRiskLevel: 'normal',
    droughtRiskScore: 32,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 52.0,
    soilMoisturePercent: 64,
    reservoirStoragePercent: 67.8,
    affectedCrops: ['ข้าวหอมมะลิอินทรีย์', 'มันสำปะหลัง'],
    agriculturalAdvisory: 'ระดับน้ำและสภาพอากาศอยู่ในเกณฑ์ปกติ เหมาะต่อการบำรุงรวงข้าวหอมมะลิอินทรีย์',
    recommendedActions: [
      'สำรองน้ำเก็บในแหล่งน้ำประจำฟาร์ม',
      'ควบคุมวัชพืชในแปลงนาข้าวแบบชีววิธี',
    ],
    urgency: 'watch',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง สุรินทร์ 1', 'อ่างเก็บน้ำจำลอง สุรินทร์ 2'],
  },
  {
    provinceCode: '47',
    provinceName: 'สกลนคร',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำสงคราม - หนองหาร',
    overallRisk: 'warning',
    floodRiskScore: 77,
    floodRiskLevel: 'warning',
    droughtRiskScore: 19,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 128.0,
    soilMoisturePercent: 87,
    reservoirStoragePercent: 85.0,
    affectedCrops: ['ข้าวนาปี', 'คราม', 'ยางพารา'],
    agriculturalAdvisory: 'หนองหารมีปริมาณน้ำเกิน 85% เร่งระบายลงลำน้ำก่ำสู่แม่น้ำโขงเพื่อรองรับฝนระลอกใหม่',
    recommendedActions: [
      'เร่งเปิดประตูลำน้ำก่ำเพื่อลดระดับน้ำหนองหาร',
      'ย้ายแปลงปลูกครามและพืชย้อมสีธรรมชาติขึ้นที่ดอน',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง สกลนคร 1', 'อ่างเก็บน้ำจำลอง สกลนคร 2'],
  },
  {
    provinceCode: '31',
    provinceName: 'บุรีรัมย์',
    region: 'ภาคตะวันออกเฉียงเหนือ',
    basinName: 'ลุ่มน้ำมูล - ลำปลายมาศ',
    overallRisk: 'normal',
    floodRiskScore: 38,
    floodRiskLevel: 'normal',
    droughtRiskScore: 42,
    droughtRiskLevel: 'warning',
    rainfall7dMm: 34.5,
    soilMoisturePercent: 54,
    reservoirStoragePercent: 52.1,
    affectedCrops: ['ข้าวนาปี', 'อ้อย', 'มันสำปะหลัง'],
    agriculturalAdvisory: 'ฝนทิ้งช่วงในบางอำเภอตอนใต้ ดัชนีความเสี่ยงภัยแล้งเริ่มขยับขึ้น ให้กักเก็บน้ำในสระน้ำไร่นา',
    recommendedActions: [
      'ปิดประตูน้ำคลองส่งน้ำเพื่อกักเก็บน้ำสำรองไว้ใช้หน้าแล้ง',
      'คลุมโคนต้นไม้ผลและพืชไร่ด้วยฟางข้าวเพื่อลดการระเหยของน้ำ',
    ],
    urgency: 'watch',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง บุรีรัมย์ 1', 'อ่างเก็บน้ำจำลอง บุรีรัมย์ 2'],
  },

  // --- ภาคตะวันออก ---
  {
    provinceCode: '25',
    provinceName: 'ปราจีนบุรี',
    region: 'ภาคตะวันออก',
    basinName: 'ลุ่มน้ำปราจีนบุรี - บางปะกง',
    overallRisk: 'critical',
    floodRiskScore: 91,
    floodRiskLevel: 'critical',
    droughtRiskScore: 12,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 172.0,
    soilMoisturePercent: 95,
    reservoirStoragePercent: 93.8,
    affectedCrops: ['ข้าวนาปี', 'ไผ่ตง', 'สมุนไพร'],
    agriculturalAdvisory: 'แม่น้ำปราจีนบุรีล้นตลิ่งท่วมขังพื้นที่เกษตรในอำเภอกบินทร์บุรีและศรีมหาโพธิ ระดับน้ำสูงกว่าตลิ่ง 80 ซม.',
    recommendedActions: [
      'เร่งเก็บผลผลิตไผ่ตงและสมุนไพรที่เก็บเกี่ยวได้',
      'ตัดทางระบายน้ำจากแปลงเกษตรลงสู่คลองสาขา',
      'เฝ้าระวังน้ำเน่าเสียจากการท่วมขังเกิน 5 วัน',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ปราจีนบุรี 1', 'อ่างเก็บน้ำจำลอง ปราจีนบุรี 2'],
  },
  {
    provinceCode: '21',
    provinceName: 'ระยอง',
    region: 'ภาคตะวันออก',
    basinName: 'ลุ่มน้ำประแสร์',
    overallRisk: 'warning',
    floodRiskScore: 70,
    floodRiskLevel: 'warning',
    droughtRiskScore: 25,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 118.0,
    soilMoisturePercent: 84,
    reservoirStoragePercent: 82.3,
    affectedCrops: ['ทุเรียน', 'มังคุด', 'ยางพารา'],
    agriculturalAdvisory: 'ดินในสวนทุเรียนอิ่มตัวด้วยน้ำ เสี่ยงต่อโรครากเน่าโคนเน่า (ไฟทอปธอรา) จากความชื้นสูง',
    recommendedActions: [
      'ขุดร่องระบายน้ำรอบโคนต้นทุเรียน ไม่ให้น้ำท่วมขังบริเวณชายพุ่ม',
      'งดการให้ปุ๋ยไนโตรเจนสูงช่วงนี้เพื่อลดการแตกใบอ่อนปะปนดอก',
      'พ่นสารชีวภัณฑ์ไตรโคเดอร์มาเพื่อควบคุมเชื้อราในดิน',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ระยอง 1', 'อ่างเก็บน้ำจำลอง ระยอง 2'],
  },
  {
    provinceCode: '22',
    provinceName: 'จันทบุรี',
    region: 'ภาคตะวันออก',
    basinName: 'ลุ่มน้ำจันทบุรี',
    overallRisk: 'warning',
    floodRiskScore: 73,
    floodRiskLevel: 'warning',
    droughtRiskScore: 21,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 130.5,
    soilMoisturePercent: 85,
    reservoirStoragePercent: 84.1,
    affectedCrops: ['ทุเรียนภูเขา', 'พริกไทย', 'เงาะ'],
    agriculturalAdvisory: 'ฝนตกชุกตามแนวเขาคิชฌกูฏ ให้ระวังน้ำหลากเข้าสวนผลไม้เชิงเขาและดินสไลด์',
    recommendedActions: [
      'ตรวจเช็กคันดินและทางน้ำไหลผ่านสวนทุเรียน',
      'ฉีดพ่นเชื้อราปฏิปักษ์ป้องกันโรคผลเน่า',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง จันทบุรี 1', 'อ่างเก็บน้ำจำลอง จันทบุรี 2'],
  },

  // --- ภาคตะวันตก ---
  {
    provinceCode: '71',
    provinceName: 'กาญจนบุรี',
    region: 'ภาคตะวันตก',
    basinName: 'ลุ่มน้ำแม่กลอง (แควน้อย-แควใหญ่)',
    overallRisk: 'normal',
    floodRiskScore: 52,
    floodRiskLevel: 'normal',
    droughtRiskScore: 30,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 62.0,
    soilMoisturePercent: 68,
    reservoirStoragePercent: 74.0,
    affectedCrops: ['อ้อยโรงงาน', 'มันสำปะหลัง', 'หน่อไม้ฝรั่ง'],
    agriculturalAdvisory: 'เขื่อนศรีนครินทร์และวชิราลงกรณบริหารจัดการน้ำได้ดี อัตราน้ำเพียงพอต่ออ้อยและพืชไร่',
    recommendedActions: [
      'บำรุงแปลงอ้อยโรงงานก่อนเข้าสู่ฤดูหีบอ้อย',
      'กำจัดวัชพืชและตรวจเช็กระบบน้ำหยดแปลงหน่อไม้ฝรั่ง',
    ],
    urgency: 'watch',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง กาญจนบุรี 1', 'อ่างเก็บน้ำจำลอง กาญจนบุรี 2'],
  },
  {
    provinceCode: '76',
    provinceName: 'เพชรบุรี',
    region: 'ภาคตะวันตก',
    basinName: 'ลุ่มน้ำเพชรบุรี',
    overallRisk: 'warning',
    floodRiskScore: 71,
    floodRiskLevel: 'warning',
    droughtRiskScore: 23,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 114.2,
    soilMoisturePercent: 82,
    reservoirStoragePercent: 81.6,
    affectedCrops: ['กล้วยไข่', 'มะนาวแป้น', 'ชมพู่เพชร'],
    agriculturalAdvisory: 'เขื่อนแก่งกระจานระบายน้ำลงสู่แม่น้ำเพชรบุรีต่อเนื่อง ให้เฝ้าระวังพื้นที่ลุ่มบ้านแหลมและเมืองเพชรบุรี',
    recommendedActions: [
      'ติดตั้งเครื่องสูบน้ำปลายคลองระบายน้ำ D9',
      'ยกต้นมะนาวในกระถาง/วงบ่อซีเมนต์ให้พ้นระดับน้ำล้น',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง เพชรบุรี 1', 'อ่างเก็บน้ำจำลอง เพชรบุรี 2'],
  },
  {
    provinceCode: '77',
    provinceName: 'ประจวบคีรีขันธ์',
    region: 'ภาคตะวันตก',
    basinName: 'ลุ่มน้ำปราณบุรี - กุยบุรี',
    overallRisk: 'warning',
    floodRiskScore: 35,
    floodRiskLevel: 'normal',
    droughtRiskScore: 65,
    droughtRiskLevel: 'warning',
    rainfall7dMm: 22.0,
    soilMoisturePercent: 38,
    reservoirStoragePercent: 28.5,
    affectedCrops: ['สับปะรดปัตตาเวีย', 'มะพร้าวทับสะแก', 'ปาล์มน้ำมัน'],
    agriculturalAdvisory: 'วิกฤติน้ำแล้งเฉพาะจุด ปริมาณน้ำอ่างเก็บน้ำปราณบุรีต่ำกว่า 30% ให้จัดรอบเวรส่งน้ำอย่างเข้มงวด',
    recommendedActions: [
      'งดปลูกพืชใช้น้ำมาก เช่น ข้าวนาปรัง หันมาปลูกพืชตระกูลถั่วบำรุงดิน',
      'ใช้วัสดุคลุมแปลงสับปะรดรักษาความชื้นในดิน',
      'ขุดลอกบ่อบาดาลเพื่อการเกษตรเสริมระบบน้ำหยด',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง ประจวบคีรีขันธ์ 1', 'อ่างเก็บน้ำจำลอง ประจวบคีรีขันธ์ 2'],
  },

  // --- ภาคใต้ ---
  {
    provinceCode: '84',
    provinceName: 'สุราษฎร์ธานี',
    region: 'ภาคใต้',
    basinName: 'ลุ่มน้ำตาปี',
    overallRisk: 'warning',
    floodRiskScore: 79,
    floodRiskLevel: 'warning',
    droughtRiskScore: 14,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 142.8,
    soilMoisturePercent: 88,
    reservoirStoragePercent: 85.2,
    affectedCrops: ['ปาล์มน้ำมัน', 'ยางพารา', 'ทุเรียนใต้'],
    agriculturalAdvisory: 'มรสุมตะวันออกเฉียงเหนือพัดปกคลุมอ่าวไทย ปริมาณน้ำลุ่มน้ำตาปีเอ่อท่วมพื้นที่ลุ่มพระแสงและพุนพิน',
    recommendedActions: [
      'ขุดระบายน้ำในร่องสวนปาล์มน้ำมันเพื่อป้องกันรากเน่า',
      'งดกรีดยางพาราในวันฝนตกหนักเพื่อป้องกันโรคเส้นดำและเปลือกเน่า',
      'สำรองปุ๋ยและยาป้องกันเชื้อราหลังน้ำลด',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง สุราษฎร์ธานี 1', 'อ่างเก็บน้ำจำลอง สุราษฎร์ธานี 2'],
  },
  {
    provinceCode: '80',
    provinceName: 'นครศรีธรรมราช',
    region: 'ภาคใต้',
    basinName: 'ลุ่มน้ำปากพนัง',
    overallRisk: 'critical',
    floodRiskScore: 93,
    floodRiskLevel: 'critical',
    droughtRiskScore: 7,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 210.5,
    soilMoisturePercent: 98,
    reservoirStoragePercent: 95.5,
    affectedCrops: ['ส้มโอทับทิมสยาม', 'มังคุดเขาคีรีวง', 'ยางพารา'],
    agriculturalAdvisory: 'วิกฤติน้ำหลากจากเทือกเขาหลวงไหลลงสู่แอ่งปากพนัง ประตูระบายน้ำอุทกวิภาชประสิทธิเปิดระบายเต็มพิกัด',
    recommendedActions: [
      'เร่งเปิดประตูระบายน้ำทุกช่องทางผลักดันน้ำออกสู่อ่าวไทย',
      'เสริมคันดินกั้นน้ำรอบสวนส้มโอทับทิมสยาม GI โดยด่วน',
      'จัดทีมเฝ้าระวังระดับน้ำตลอด 24 ชั่วโมง',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง นครศรีธรรมราช 1', 'อ่างเก็บน้ำจำลอง นครศรีธรรมราช 2'],
  },
  {
    provinceCode: '90',
    provinceName: 'สงขลา',
    region: 'ภาคใต้',
    basinName: 'ลุ่มน้ำทะเลสาบสงขลา - คลองอู่ตะเภา',
    overallRisk: 'warning',
    floodRiskScore: 74,
    floodRiskLevel: 'warning',
    droughtRiskScore: 16,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 126.0,
    soilMoisturePercent: 86,
    reservoirStoragePercent: 83.1,
    affectedCrops: ['ยางพารา', 'ไม้ผล', 'กุ้งกุลาดำ/ปลากะพง'],
    agriculturalAdvisory: 'เฝ้าระวังระดับน้ำคลองอู่ตะเภาเอ่อท่วมบ่อกุ้งและบ่อปลา ให้ขึงตาข่ายรอบบ่อป้องกันสัตว์น้ำหลุดรอด',
    recommendedActions: [
      'ขึงตาข่ายรอบคันบ่อเลี้ยงสัตว์น้ำสูงอย่างน้อย 50 ซม.',
      'เตรียมเครื่องกำเนิดไฟฟ้าสำรองสำหรับเครื่องเพิ่มออกซิเจนในบ่อ',
    ],
    urgency: 'warning',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง สงขลา 1', 'อ่างเก็บน้ำจำลอง สงขลา 2'],
  },
  {
    provinceCode: '96',
    provinceName: 'นราธิวาส',
    region: 'ภาคใต้',
    basinName: 'ลุ่มน้ำโก-ลก - สายบุรี',
    overallRisk: 'critical',
    floodRiskScore: 90,
    floodRiskLevel: 'critical',
    droughtRiskScore: 9,
    droughtRiskLevel: 'normal',
    rainfall7dMm: 185.0,
    soilMoisturePercent: 96,
    reservoirStoragePercent: 92.0,
    affectedCrops: ['ลองกองซีนอ', 'ยางพารา', 'ปาล์มน้ำมัน'],
    agriculturalAdvisory: 'แม่น้ำสุไหงโก-ลก ล้นตลิ่งท่วมขังพื้นที่เกษตรที่ลุ่มต่ำริมฝั่ง ขอให้เกษตรกรระมัดระวังอันตรายจากน้ำท่วมฉับพลัน',
    recommendedActions: [
      'อพยพสัตว์เลี้ยงและเครื่องสูบน้ำขึ้นที่สูง',
      'แจ้งศูนย์เตือนภัยตำบลทันทีหากระดับน้ำท่วมทางสัญจรแปลงเกษตร',
    ],
    urgency: 'urgent',
    keyReservoirs: ['อ่างเก็บน้ำจำลอง นราธิวาส 1', 'อ่างเก็บน้ำจำลอง นราธิวาส 2'],
  },
];

/**
 * 14-Day Forward Simulation Forecast (25 ต.ค. - 7 พ.ย. 2569)
 * จำลองแนวโน้มปริมาณน้ำฝน ปริมาณน้ำท่าเข้าอ่างเก็บน้ำ และความน่าจะเป็นของเหตุการณ์น้ำท่วม/ภัยแล้ง
 */
export const SIMULATION_FORECAST_14_DAYS: SimulationForecastDay[] = [
  {
    day: 1,
    date: '2026-10-25',
    dayLabel: '25 ต.ค. (วันนี้)',
    rainfallAvgMm: 28.5,
    inflowForecastMcm: 85.2,
    floodProbability: 78,
    droughtProbability: 12,
    riskTrend: 'increasing',
    activeFront: 'ร่องมรสุมพาดผ่านภาคกลางตอนล่าง ภาคตะวันออก และภาคใต้ตอนบน',
    advisoryHeadline: 'เฝ้าระวังฝนตกหนักต่อเนื่อง ลุ่มน้ำเจ้าพระยา ป่าสัก บางปะกง เสี่ยงน้ำเอ่อตลิ่ง',
  },
  {
    day: 2,
    date: '2026-10-26',
    dayLabel: '26 ต.ค. (D+1)',
    rainfallAvgMm: 34.2,
    inflowForecastMcm: 98.4,
    floodProbability: 84,
    droughtProbability: 10,
    riskTrend: 'increasing',
    activeFront: 'หย่อมความกดอากาศต่ำกำลังปานกลางเคลื่อนเข้าสู่อ่าวไทยตอนบน',
    advisoryHeadline: 'พีคสูงสุดในภาคกลางและตะวันออก คันกั้นน้ำดินทุ่งรับน้ำอาจรับแรงดันสูงสุด',
  },
  {
    day: 3,
    date: '2026-10-27',
    dayLabel: '27 ต.ค. (D+2)',
    rainfallAvgMm: 38.0,
    inflowForecastMcm: 112.0,
    floodProbability: 88,
    droughtProbability: 9,
    riskTrend: 'increasing',
    activeFront: 'ฝนตกหนักครอบคลุม 18 จังหวัดภาคกลางและภาคใต้ตอนบน',
    advisoryHeadline: 'ระดับวิกฤติสูงสุด: เร่งเกี่ยวข้าวในแปลงนาหนีน้ำ เดินเครื่องสูบน้ำ 24 ชม.',
  },
  {
    day: 4,
    date: '2026-10-28',
    dayLabel: '28 ต.ค. (D+3)',
    rainfallAvgMm: 31.5,
    inflowForecastMcm: 105.0,
    floodProbability: 85,
    droughtProbability: 11,
    riskTrend: 'stable',
    activeFront: 'ร่องมรสุมเริ่มเลื่อนลงสู่ภาคใต้ตอนบน ชุมพร สุราษฎร์ธานี นครศรีธรรมราช',
    advisoryHeadline: 'น้ำเหนือเริ่มไหลรวมลงสู่อยุธยาและปทุมธานี เกษตรกรริมฝั่งเฝ้าระวังน้ำขัง',
  },
  {
    day: 5,
    date: '2026-10-29',
    dayLabel: '29 ต.ค. (D+4)',
    rainfallAvgMm: 24.8,
    inflowForecastMcm: 88.6,
    floodProbability: 75,
    droughtProbability: 14,
    riskTrend: 'decreasing',
    activeFront: 'มวลอากาศเย็นจากจีนแผ่ลงมาปกคลุมภาคเหนือและอีสานตอนบน',
    advisoryHeadline: 'ภาคเหนือฝนเริ่มซาลง ระดับน้ำแม่น้ำยมและปิงเริ่มทรงตัว เตรียมสำรวจความเสียหาย',
  },
  {
    day: 6,
    date: '2026-10-30',
    dayLabel: '30 ต.ค. (D+5)',
    rainfallAvgMm: 18.2,
    inflowForecastMcm: 72.1,
    floodProbability: 66,
    droughtProbability: 16,
    riskTrend: 'decreasing',
    activeFront: 'ลมหนาวเริ่มมีกำลัง ปลายฝนต้นหนาวในภาคเหนือและอีสาน',
    advisoryHeadline: 'ดินยังอุ้มน้ำสูง ให้ระวังโรครากเน่าในไม้ผล แต่เริ่มวางแผนกักเก็บน้ำนาปรังได้',
  },
  {
    day: 7,
    date: '2026-10-31',
    dayLabel: '31 ต.ค. (D+6)',
    rainfallAvgMm: 14.0,
    inflowForecastMcm: 58.4,
    floodProbability: 55,
    droughtProbability: 18,
    riskTrend: 'decreasing',
    activeFront: 'ลมมรสุมตะวันออกเฉียงเหนือเริ่มมีผลต่อภาคใต้เต็มตัว',
    advisoryHeadline: 'ภาคใต้ฝั่งอ่าวไทยเริ่มเข้าสู่ฤดูมรสุมหลัก สวนยางและปาล์มน้ำมันเฝ้าระวังน้ำท่วม',
  },
  {
    day: 8,
    date: '2026-11-01',
    dayLabel: '1 พ.ย. (D+7)',
    rainfallAvgMm: 12.5,
    inflowForecastMcm: 49.0,
    floodProbability: 48,
    droughtProbability: 20,
    riskTrend: 'stable',
    activeFront: 'อากาศแห้งเข้าปกคลุมภาคเหนือ อุณหภูมิต่ำสุดลดลง 1-3 องศา',
    advisoryHeadline: 'ภาคเหนือ-อีสานปลอดภัยจากน้ำท่วม แนะนำเริ่มไถเตรียมดินปลูกพืชไร่หลังน้ำลด',
  },
  {
    day: 9,
    date: '2026-11-02',
    dayLabel: '2 พ.ย. (D+8)',
    rainfallAvgMm: 10.8,
    inflowForecastMcm: 42.5,
    floodProbability: 40,
    droughtProbability: 22,
    riskTrend: 'decreasing',
    activeFront: 'ภาคกลางตอนล่างเริ่มระบายน้ำลงสู่ทะเลได้รวดเร็วขึ้น',
    advisoryHeadline: 'ระดับน้ำคลองสายหลักลดลง 15-25 ซม. ทะยอยเปิดประตูน้ำสู่แปลงเกษตรเพื่อทำกักเก็บ',
  },
  {
    day: 10,
    date: '2026-11-03',
    dayLabel: '3 พ.ย. (D+9)',
    rainfallAvgMm: 9.5,
    inflowForecastMcm: 37.0,
    floodProbability: 35,
    droughtProbability: 25,
    riskTrend: 'stable',
    activeFront: 'ความกดอากาศสูงปานกลางแผ่เสริม',
    advisoryHeadline: 'พืชผักสวนครัวแปลงเปิดเริ่มปลูกได้ดี ตรวจสอบความชื้นหน้าดินก่อนเริ่มเพาะเมล็ด',
  },
  {
    day: 11,
    date: '2026-11-04',
    dayLabel: '4 พ.ย. (D+10)',
    rainfallAvgMm: 8.2,
    inflowForecastMcm: 33.2,
    floodProbability: 30,
    droughtProbability: 28,
    riskTrend: 'stable',
    activeFront: 'มรสุมพาดผ่านภาคใต้ตอนล่าง สงขลา ปัตตานี นราธิวาส',
    advisoryHeadline: 'เฝ้าระวังพื้นที่ชายแดนใต้ สวนผลไม้และแปลงพืชผักลุ่มน้ำสายบุรีเสี่ยงน้ำเอ่อ',
  },
  {
    day: 12,
    date: '2026-11-05',
    dayLabel: '5 พ.ย. (D+11)',
    rainfallAvgMm: 7.6,
    inflowForecastMcm: 30.1,
    floodProbability: 26,
    droughtProbability: 30,
    riskTrend: 'decreasing',
    activeFront: 'ลมหนาวแผ่ลึกถึงภาคกลางตอนบน',
    advisoryHeadline: 'อุณหภูมิลดต่ำ หมอกหนายามเช้า เกษตรกรระวังโรคราน้ำค้างในผักตระกูลกะหล่ำ',
  },
  {
    day: 13,
    date: '2026-11-06',
    dayLabel: '6 พ.ย. (D+12)',
    rainfallAvgMm: 6.9,
    inflowForecastMcm: 27.5,
    floodProbability: 22,
    droughtProbability: 33,
    riskTrend: 'stable',
    activeFront: 'สภาวะอากาศสงบ ภาคเหนือและอีสานเข้าสู่โหมดกักเก็บน้ำแล้ง',
    advisoryHeadline: 'เร่งสำรองน้ำไว้ในสระประจำไร่นาเพื่อใช้ตลอดฤดูหนาวและแล้งถัดไป',
  },
  {
    day: 14,
    date: '2026-11-07',
    dayLabel: '7 พ.ย. (D+13)',
    rainfallAvgMm: 6.2,
    inflowForecastMcm: 25.0,
    floodProbability: 18,
    droughtProbability: 35,
    riskTrend: 'stable',
    activeFront: 'แบบจำลองสิ้นสุดรอบการเตือนภัยน้ำหลากฉับพลัน เข้าสู่ฤดูพืชฤดูแล้ง',
    advisoryHeadline: 'สิ้นสุดช่วงวิกฤติน้ำหลากใหญ่ ปรับคำแนะนำสู่การปลูกพืชใช้น้ำน้อยและการทำนาปรังรอบแรก',
  },
];

/* ------------------------------------------------------------------ */
/* Deterministic synthetic reservoir universe (no upstream values)     */
/* ------------------------------------------------------------------ */

type SimulatedReservoir = {
  id: string;
  name: string;
  region: string;
  storage: number;
  volume: number;
  percent: number;
  deadStorage: number;
  inflow: number | null;
  outflow: number | null;
  kind: 'overflow' | 'drought' | 'normal';
  provinceCode: string;
  provinceName: string;
};

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

const RESERVOIRS_PER_SIMULATED_PROVINCE = 3;

/**
 * Builds 3 virtual reservoirs per simulated province. Names and ids are
 * prefixed with `จำลอง`/`sim-` and never match the RID snapshot; values come
 * from the seed string only, so repeated calls are byte-stable.
 */
function buildSimulatedReservoirUniverse(): SimulatedReservoir[] {
  const rows: SimulatedReservoir[] = [];

  for (const province of PROVINCIAL_RISK_DATA) {
    for (let index = 1; index <= RESERVOIRS_PER_SIMULATED_PROVINCE; index += 1) {
      const seed = `ew-sim:${province.provinceCode}:${index}`;
      const percent = Math.round((10 + seededUnit(seed + ':pct') * 95) * 10) / 10;
      const storage = Math.round((4 + seededUnit(seed + ':storage') * 116) * 10) / 10;
      const volume = Math.round(storage * (percent / 100) * 1000) / 1000;
      const deadStorage = Math.round(storage * 0.05 * 100) / 100;
      const kind: SimulatedReservoir['kind'] =
        percent > 80 ? 'overflow' : percent < 30 ? 'drought' : 'normal';

      rows.push({
        id: `sim-rsv-${province.provinceCode}-${index}`,
        name: `อ่างเก็บน้ำจำลอง ${province.provinceName} ${index}`,
        region: province.region,
        storage,
        volume,
        percent,
        deadStorage,
        inflow: null,
        outflow: null,
        kind,
        provinceCode: province.provinceCode,
        provinceName: province.provinceName,
      });
    }
  }

  return rows;
}

export const SIMULATED_RESERVOIRS: SimulatedReservoir[] = buildSimulatedReservoirUniverse();

export const EARLY_WARNING_WARNINGS = [
  'ชุดข้อมูลนี้เป็นแบบจำลองสังเคราะห์ (deterministic simulation) ไม่ได้อ่านค่าจริงจากรายงานอ่างเก็บน้ำของกรมชลประทาน (RID)',
  'ตัวเลขทั้งหมดเป็น sample: true และ meta.access = metadata_only — ห้ามใช้เป็นประกาศเตือนภัยหรือพยากรณ์ที่เผยแพร่แล้ว',
  'อ่างเก็บน้ำในหน้านี้เป็นอ่างจำลอง (sim-*) มิได้อ้างอิงชื่อหรือปริมาตรของอ่างจริง',
  'จะเปิดตัวเลขจริงได้เมื่อ resource ผ่านการตรวจสิทธิ์และมี active approved batch ที่ตรวจเทียบกับต้นทางแล้ว',
];

/**
 * Calculates the demo summary from the synthetic reservoir universe and the
 * simulated provincial risk matrix. No RID row or count is read here.
 */
export function getEarlyWarningSummary(): EarlyWarningSummary {
  const total = SIMULATED_RESERVOIRS.length;
  const over80 = SIMULATED_RESERVOIRS.filter((r) => r.kind === 'overflow');
  const under30 = SIMULATED_RESERVOIRS.filter((r) => r.kind === 'drought');
  const safe = total - over80.length - under30.length;

  const highRiskProvinces = PROVINCIAL_RISK_DATA.filter((p) => p.overallRisk === 'critical').length;
  const warningProvinces = PROVINCIAL_RISK_DATA.filter((p) => p.overallRisk === 'warning').length;
  const normalProvinces = PROVINCIAL_RISK_DATA.filter((p) => p.overallRisk === 'normal').length;

  const rainfallValues = PROVINCIAL_RISK_DATA.map((p) => p.rainfall7dMm).filter((v): v is number => v !== null);
  const avgRainfall = rainfallValues.length
    ? Math.round((rainfallValues.reduce((sum, v) => sum + v, 0) / rainfallValues.length) * 10) / 10
    : 0;
  const maxRainfall = rainfallValues.length ? Math.max(...rainfallValues) : 0;

  return {
    totalReservoirs: total,
    criticalFloodCount: over80.length,
    criticalDroughtCount: under30.length,
    safeReservoirsCount: safe,
    highRiskProvincesCount: highRiskProvinces,
    warningProvincesCount: warningProvinces,
    normalProvincesCount: normalProvinces,
    avgRainfall7dMm: avgRainfall,
    maxRainfall7dMm: maxRainfall,
    rainfallBasis: 'ค่าเฉลี่ย/ค่าสูงสุดจากตารางจำลองรายจังหวัด (ไม่ใช่ค่าตรวจวัดจากสถานีหรือดาวเทียม)',
    disasterAlertLevel: 'warning',
    headline: `แบบจำลองสาธิต: อ่างจำลองเกิน 80% จำนวน ${over80.length} แห่ง และต่ำกว่า 30% จำนวน ${under30.length} แห่ง (ข้อมูลสังเคราะห์)`,
    subheadline:
      'ค่าทั้งหมดสร้างจากแบบจำลองเชิงโครงสร้างเพื่อทดสอบหน้าจอเท่านั้น ไม่ได้มาจากรายงานอ่างเก็บน้ำจริงและไม่ใช่ประกาศเตือนภัย',
    sample: true,
    reportDate: '2026-10-25',
  };
}

/**
 * Apply the dashboard's Region / Risk / Type / Search filters to any provincial
 * row list — the simulated matrix and the real-evidence matrix share it.
 */
export function filterProvinceRisks(
  rows: ProvinceRiskItem[],
  options?: { region?: string; risk?: string; query?: string; type?: RiskType },
): ProvinceRiskItem[] {
  let list = [...rows];

  if (!options) return list;

  if (options.region && options.region !== 'all') {
    list = list.filter((p) => p.region === options.region);
  }

  if (options.risk && options.risk !== 'all') {
    list = list.filter((p) => p.overallRisk === options.risk);
  }

  if (options.type && options.type !== 'all') {
    if (options.type === 'flood') {
      list = list.filter((p) => p.floodRiskLevel === 'critical' || p.floodRiskLevel === 'warning');
    } else if (options.type === 'drought') {
      list = list.filter((p) => p.droughtRiskLevel === 'critical' || p.droughtRiskLevel === 'warning');
    }
  }

  if (options.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.provinceName.toLowerCase().includes(q) ||
        p.basinName.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.affectedCrops.some((c) => c.toLowerCase().includes(q))
    );
  }

  return list;
}

/**
 * ดึงรายการจังหวัดความเสี่ยง จากเมทริกซ์จำลอง (โหมด fallback)
 */
export function getProvinceRisks(options?: {
  region?: string;
  risk?: string;
  query?: string;
  type?: RiskType;
}): ProvinceRiskItem[] {
  return filterProvinceRisks(PROVINCIAL_RISK_DATA, options);
}

/** Region / type / search filters shared by simulated and published reservoir rows. */
export function filterCriticalReservoirs(
  rows: CriticalReservoir[],
  options?: { region?: string; type?: 'all' | 'overflow' | 'drought'; query?: string },
): CriticalReservoir[] {
  let combined = [...rows];

  if (options?.type && options.type !== 'all') {
    combined = combined.filter((r) => r.type === options.type);
  }

  if (options?.region && options.region !== 'all') {
    combined = combined.filter((r) => r.region === options.region);
  }

  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    combined = combined.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }

  // Sort by percent descending for overflow, ascending for drought
  return combined.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
}

/**
 * Returns critical rows from the synthetic reservoir universe (>80% overflow
 * or <30% drought). Names/ids stay `อ่างเก็บน้ำจำลอง`/`sim-rsv-*` and never
 * reuse RID reservoir identities or values.
 */
export function getCriticalReservoirs(options?: {
  region?: string;
  type?: 'all' | 'overflow' | 'drought';
  query?: string;
}): CriticalReservoir[] {
  const overflowItems: CriticalReservoir[] = SIMULATED_RESERVOIRS.filter((r) => r.kind === 'overflow').map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    storage: r.storage,
    volume: r.volume,
    percent: r.percent,
    deadStorage: r.deadStorage,
    inflow: r.inflow,
    outflow: r.outflow,
    type: 'overflow',
    riskLabel: 'แบบจำลอง: เกิน 80% (เสี่ยงล้นทางระบายน้ำ)',
    advisoryNote: 'ข้อความนี้เป็นส่วนหนึ่งของแบบจำลองสาธิต ไม่ใช่คำแนะนำจากหน่วยงานต้นทาง',
  }));

  const droughtItems: CriticalReservoir[] = SIMULATED_RESERVOIRS.filter((r) => r.kind === 'drought').map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    storage: r.storage,
    volume: r.volume,
    percent: r.percent,
    deadStorage: r.deadStorage,
    inflow: r.inflow,
    outflow: r.outflow,
    type: 'drought',
    riskLabel: 'แบบจำลอง: ต่ำกว่า 30% (ปริมาณน้ำใช้การได้ต่ำ)',
    advisoryNote: 'ข้อความนี้เป็นส่วนหนึ่งของแบบจำลองสาธิต ไม่ใช่คำแนะนำจากหน่วยงานต้นทาง',
  }));

  return filterCriticalReservoirs([...overflowItems, ...droughtItems], options);
}

export function get14DaySimulationForecast(): SimulationForecastDay[] {
  return SIMULATION_FORECAST_14_DAYS;
}

/* ==================================================================== */
/* Real-evidence risk engine                                            */
/* ==================================================================== */

/** เกณฑ์ที่ชั้นนี้ใช้เปลี่ยน "ค่าตรวจวัด" เป็น "ระดับเตือนภัย" — ดัชนีภายในของ TADIH */
export const EARLY_WARNING_THRESHOLDS = {
  /** อ่างเก็บน้ำ (หน่วย: % ของความจุเก็บกัก ตามที่ RID รายงาน) */
  ridDroughtCriticalPercent: 15,
  ridDroughtWarningPercent: 30,
  ridOverflowWarningPercent: 80,
  ridOverflowCriticalPercent: 100,
  /** สถานี TMD (หน่วย: มม./วัน และ °C — การจัดชั้นอ้างอิงเกณฑ์ฝนหนัก/ร้อนจัดที่ TMD ใช้นำเสนอ) */
  tmdHeavyRainMm: 35,
  tmdVeryHeavyRainMm: 90,
  tmdHotMaxC: 40,
  tmdVeryHotMaxC: 43,
  /** GISTDA polygon (แยกหน่วยไร่/นาข้าว ห้ามบวกข้ามหน่วย) */
  gistdaFloodWatchRai: 50,
  gistdaFloodWarningRai: 200,
  gistdaFloodCriticalRai: 2000,
  gistdaRiceWarningRai: 100,
  gistdaRiceCriticalRai: 1000,
} as const;

export const EARLY_WARNING_ANALYTICS_DISCLAIMER =
  'ข้อมูลตั้งต้นของสัญญาณแต่ละตัวเป็นค่าตรวจวัดจริงที่เผยแพร่ในคลังข้อมูลกลาง: ระดับน้ำอ่างเก็บน้ำจากกรมชลประทาน (RID), '
  + 'พื้นที่น้ำท่วมและนาข้าวจาก polygon ของ GISTDA (Sentinel-1 C-SAR) และปริมาณฝน/อุณหภูมิจากสถานีกรมอุตุนิยมวิทยา (TMD) '
  + 'แต่ "ระดับความเสี่ยง เกณฑ์เตือนภัย ดัชนี 0-100 และคำแนะนำ" เป็นดัชนีวิเคราะห์ภายในของ TADIH เพื่อประกอบการวางแผนเท่านั้น '
  + 'ไม่ใช่การพยากรณ์อย่างเป็นทางการ และไม่ใช่ประกาศเขตพื้นที่ประสบสาธารณภัยของทางราชการ '
  + 'กรุณายืนยันกับหน่วยงานต้นทางก่อนใช้ประกอบการช่วยเหลือผู้ประสบภัยหรือจัดสรรงบประมาณ';

export const EARLY_WARNING_REAL_BANNER =
  'สัญญาณตั้งต้นจากข้อมูลตรวจวัดจริง (RID · GISTDA SAR · TMD) — ระดับความเสี่ยงเป็นดัชนีวิเคราะห์ภายในของ TADIH ไม่ใช่ประกาศราชการ';

export const EARLY_WARNING_REAL_WARNINGS: string[] = [
  EARLY_WARNING_ANALYTICS_DISCLAIMER,
  'สัญญาณอ่างเก็บน้ำเป็นระดับ "รายอ่าง" ต้นทางไม่มีรหัสจังหวัดทางการ จึงห้ามตีความเป็นค่าเฉลี่ยหรือ coverage ของจังหวัด',
  'ชั้นน้ำท่วมแสดงเฉพาะจังหวัดที่ GISTDA ตรวจพบ polygon ในหน้าต่าง 7 วัน จังหวัดที่ไม่อยู่ในรายการคือ "ไม่ถูกตรวจพบ" ไม่ใช่ "ยืนยันว่าไม่ท่วม"',
  'ค่าฝน/อุณหภูมิเป็นค่าตรวจวัด "รายสถานี" จังหวัดที่ไม่มีสถานีรายงานไม่ได้หมายความว่าไม่มีฝน',
  'หน่วยของค่าตรวจวัดเป็นตามที่ต้นทางรายงาน: พื้นที่แยกหน่วยไร่และ ตร.กม. (ห้ามบวกข้ามหน่วย) และหน่วยของค่าสถานีอยู่ระหว่างรอการยืนยันอย่างเป็นทางการจาก TMD',
  'ไทม์ไลน์ 14 วันและค่าความชื้นดินยังเป็นชั้นแบบจำลอง (dataKind=modelled) เพราะยังไม่มีแหล่ง forecast ที่ได้รับสิทธิ์เผยแพร่',
];

/** Presentation of every measured layer that can raise a signal. */
export const RISK_SIGNAL_SOURCES: Record<RiskSignalSourceId, {
  badge: string;
  sourceName: string;
  attribution: string;
  endpoint: string;
  grain: string;
}> = {
  rid: {
    badge: 'RID Reservoir',
    sourceName: 'กรมชลประทาน (RID) — รายงานอ่างเก็บน้ำขนาดกลางรายวัน',
    attribution: 'กรมชลประทาน (RID)',
    endpoint: 'https://app.rid.go.th/reservoir/api/reservoir/public',
    grain: 'reservoir × report_date',
  },
  gistda: {
    badge: 'GISTDA SAR',
    sourceName: 'GISTDA — polygon น้ำท่วมรอบ 7 วัน (Sentinel-1 C-SAR / Radarsat-2)',
    attribution: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) — GISTDA',
    endpoint: 'https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days',
    grain: 'polygon × tambon (รวมเป็นจังหวัด DOPA)',
  },
  tmd: {
    badge: 'TMD Station',
    sourceName: 'กรมอุตุนิยมวิทยา (TMD) — ค่าตรวจวัดรายสถานีประจำวัน',
    attribution: 'กรมอุตุนิยมวิทยา (TMD)',
    endpoint: 'https://data.tmd.go.th/api/WeatherToday/V2/',
    grain: 'station × observation_date',
  },
};

export interface RiskSignalProvenance {
  sourceId: RiskSignalSourceId;
  badge: string;
  sourceName: string;
  endpoint: string;
  dataKind: 'observed';
  grain: string;
  runId: string | null;
  sourceUpdatedAt: string | null;
  dataAsOf: string | null;
}

export interface RiskAlertItem {
  id: string;
  sourceId: RiskSignalSourceId;
  badge: string;
  sourceName: string;
  hazard: RiskHazard;
  level: DisasterAlertLevel;
  /** 0-100 ตามเกณฑ์ภายในของ TADIH (ไม่ใช่ค่าที่ต้นทางประกาศ) */
  score: number;
  provinceCode: string | null;
  provinceName: string | null;
  region: string | null;
  locationId: string;
  locationName: string | null;
  metricId: string;
  metricLabel: string;
  metricValue: number | null;
  metricUnit: string | null;
  thresholdLabel: string;
  evidenceText: string;
  advisoryText: string;
  observedAt: string | null;
  provenance: RiskSignalProvenance;
}

/* ---- Structural inputs the repositories/pages hand to this module ---- */

export type ReservoirEvidenceRow = {
  reservoirId: string;
  name: string | null;
  region: string | null;
  reportDate: string | null;
  volumeMcm: number | null;
  volumeUnit: string | null;
  storagePercent: number | null;
  sourceRowRef: string | null;
};

export type FloodEvidenceRow = {
  provinceCode: string;
  provinceNameTh: string | null;
  provinceNameEn: string | null;
  polygonCount: number;
  floodedAreaRai: number;
  floodedAreaSqKm: number;
  riceAreaRai: number | null;
  satelliteSources: string[];
};

export type StationEvidenceRow = {
  stationCode: string;
  stationNameTh: string | null;
  network: string;
  provinceCode: string | null;
  provinceNameTh: string | null;
  rainfallMm: number | null;
  maxTemperatureC: number | null;
  observedAtIct: string | null;
  observationDate: string;
  sourceResourceUrl: string | null;
  unitStatus: string;
};

export type EarlyWarningEvidenceBundle = {
  /** `null` เมื่ออ่านคลังไม่พบ active numeric batch ของ RID */
  reservoirs: {
    rows: ReservoirEvidenceRow[];
    reportDate: string | null;
    runId: string | null;
    runStatus: string | null;
    sourceUpdatedAt: string | null;
    retrievedAt: string | null;
    freshnessDays: number | null;
    observationRows: number;
  } | null;
  /** `null` เมื่อชั้นน้ำท่วมไม่พร้อมในโหมด fallback (ไม่เปิดใช้ polygon ใน envelope จำลอง) */
  flood: {
    rows: FloodEvidenceRow[];
    sourceMode: 'live' | 'snapshot';
    retrievedAt: string;
    snapshotRetrievedAt: string;
    polygonCount: number;
    totalsFloodedAreaRai: number;
    totalsRiceAreaRai: number | null;
  } | null;
  /** `null` เมื่ออ่านคลังไม่พบ active numeric batch ของสถานีอากาศ */
  weather: {
    rows: StationEvidenceRow[];
    observationDate: string;
    runId: string | null;
    sourceUpdatedAt: string | null;
    freshnessDays: number | null;
    runStatus: string | null;
    networks: string[];
  } | null;
};

export type EarlyWarningSourceBlock = {
  id: RiskSignalSourceId;
  badge: string;
  name: string;
  endpoint: string;
  attribution: string;
  grain: string;
  dataKind: 'observed';
  /** ชั้นนี้มีส่วนร่วมใน payload นี้จริงหรือไม่ */
  applied: boolean;
  recordCount: number;
  signalCount: number;
  dataAsOf: string | null;
  sourceUpdatedAt: string | null;
  runId: string | null;
  note: string;
};

export type EarlyWarningDataset = {
  mode: 'real_evidence' | 'simulation_fallback';
  sample: boolean;
  bannerText: string;
  disclaimer: string;
  summary: EarlyWarningSummary;
  provinces: ProvinceRiskItem[];
  forecast14Days: SimulationForecastDay[];
  criticalReservoirs: CriticalReservoir[];
  signals: RiskAlertItem[];
  sources: EarlyWarningSourceBlock[];
  layerGovernance: {
    reservoirs: 'observed' | 'simulated';
    floodSignals: 'observed' | 'unavailable';
    weatherSignals: 'observed' | 'unavailable';
    provincialRiskIndex: 'observed_derived' | 'simulated';
    forecast14Days: 'simulated';
    soilMoisture: 'simulated';
  };
  apiMeta: Omit<ApiMeta, 'retrievedAt'>;
};

/* ------------------------------ scoring ------------------------------ */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** warning tier → 60-79, critical tier → 80-100 (ตรงกับการแบ่งสีของหน้าจอ) */
function tierScore(level: DisasterAlertLevel, ratio: number): number {
  const position = clamp01(ratio);
  return level === 'critical' ? Math.round(80 + position * 20) : Math.round(60 + position * 19);
}

function levelFromScore(score: number): DisasterAlertLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'warning';
  return 'normal';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/**
 * Thresholds below are stated in mm/°C, so they only apply to a station whose
 * unit is explicitly confirmed (`confirmed` / `confirmed_*`). A pending unit
 * never licenses a comparison or conversion; the raw value is still published
 * by the weather layer under its own contract.
 */
function hasConfirmedUnit(unitStatus: string | null | undefined): boolean {
  const value = unitStatus?.trim().toLowerCase();
  return Boolean(value && (value === 'confirmed' || value.startsWith('confirmed_')));
}

function provenanceFor(
  sourceId: RiskSignalSourceId,
  runId: string | null,
  sourceUpdatedAt: string | null,
  dataAsOf: string | null,
): RiskSignalProvenance {
  const meta = RISK_SIGNAL_SOURCES[sourceId];
  return {
    sourceId,
    badge: meta.badge,
    sourceName: meta.sourceName,
    endpoint: meta.endpoint,
    dataKind: 'observed',
    grain: meta.grain,
    runId,
    sourceUpdatedAt,
    dataAsOf,
  };
}

function provinceNameFor(code: string, names: Map<string, string>): string {
  return names.get(code) ?? `จังหวัดรหัส ${code}`;
}

/** ทะเบียนอ้างอิงคงที่ (ชื่อ/ภูมิภาค/ลุ่มน้ำ/พืชเศรษฐกิจ) จากตาราง 28 จังหวัดเกษตรกรรม */
const GEO_REFERENCE = new Map<string, { region: string; basinName: string; crops: string[] }>(
  PROVINCIAL_RISK_DATA.map((row) => [
    row.provinceCode,
    { region: row.region, basinName: row.basinName, crops: [...row.affectedCrops] },
  ]),
);

const UNKNOWN_REGION_LABEL = 'ไม่ระบุภูมิภาคในทะเบียนอ้างอิง';
const UNKNOWN_BASIN_LABEL = 'ไม่ระบุลุ่มน้ำในทะเบียนอ้างอิง';

const RISK_ADVISORY: Record<RiskHazard, Record<DisasterAlertLevel, string>> = {
  flood: {
    critical:
      'พบหลักฐานน้ำท่วมขังจริงในระดับที่ต้องเร่งช่วยเหลือ: สำรวจแปลงที่เสียหายตามพิกัดตำบล เปิดทางระบายน้ำ และเตรียมเมล็ดพันธุ์ทดแทน — เป็นคำแนะนำภายในของ TADIH',
    warning:
      'พบหลักฐานน้ำท่วมขัง/ฝนหนักในระดับเฝ้าระวัง: ตรวจสอบคันคูและทางระบายน้ำของแปลง ยกเครื่องมือเกษตรขึ้นที่สูง และเตรียมแผนสูบน้ำเสริม — เป็นคำแนะนำภายในของ TADIH',
    normal:
      'ตรวจพบหลักฐานน้ำขังแต่ต่ำกว่าเกณฑ์เฝ้าระวังภายใน: ใช้เป็นข้อมูลติดตามแปลงใกล้ทางน้ำ ยังไม่ต้องปรับแผนเพาะปลูก — เป็นคำแนะนำภายในของ TADIH',
  },
  drought: {
    critical:
      'ปริมาณน้ำในแหล่งน้ำอยู่ต่ำกว่าเกณฑ์ภายในอย่างมาก: ทบทวนแผนจัดสรรน้ำ เลื่อนการปลูกพืชใช้น้ำมาก และสำรองน้ำสำหรับสัตว์เลี้ยง — เป็นคำแนะนำภายในของ TADIH',
    warning:
      'ปริมาณน้ำในแหล่งน้ำต่ำกว่าเกณฑ์ภายใน: วางรอบเวรส่งน้ำ คลุมดินลดการระเหย และเตรียมพืชอายุสั้นใช้น้ำน้อย — เป็นคำแนะนำภายในของ TADIH',
    normal:
      'ระดับน้ำอยู่ในชั้นปกติตามเกณฑ์ภายใน: ดำเนินแผนส่งน้ำตามรอบเวรและติดตามรายงานรอบถัดไป — เป็นคำแนะนำภายในของ TADIH',
  },
  heat: {
    critical:
      'อุณหภูมิสูงสุดแตะชั้นร้อนจัดมาก: เพิ่มรอบน้ำให้พืชระยะอ่อน คลุมแปลง/โรงเรือน และเลื่อนการทำงานกลางแจ้งช่วงแดดจัด — เป็นคำแนะนำภายในของ TADIH',
    warning:
      'อุณหภูมิสูงสุดเข้าชั้นร้อนจัด: ตรวจสอบระบบน้ำในแปลงและโรงเรือน ระวังการแตกใบอ่อนของไม้ผลช่วงอุณหภูมิสูง — เป็นคำแนะนำภายในของ TADIH',
    normal:
      'อุณหภูมิยังต่ำกว่าชั้นร้อนจัดตามเกณฑ์ภายใน: ดูแลแปลงตามปกติ — เป็นคำแนะนำภายในของ TADIH',
  },
};

/* --------------------------- signal builders -------------------------- */

function buildReservoirAlerts(bundle: EarlyWarningEvidenceBundle): RiskAlertItem[] {
  const reservoirs = bundle.reservoirs;
  if (!reservoirs) return [];
  const alerts: RiskAlertItem[] = [];

  for (const row of reservoirs.rows) {
    const percent = row.storagePercent;
    if (percent === null || !Number.isFinite(percent)) continue;
    const name = row.name ?? row.reservoirId;
    const volumeText = row.volumeMcm === null
      ? 'ต้นทางไม่ได้รายงานปริมาตรน้ำ'
      : `ปริมาตรน้ำ ${formatNumber(row.volumeMcm, 3)} ${row.volumeUnit ?? 'ล้าน ลบ.ม.'}`;

    let hazard: RiskHazard | null = null;
    let level: DisasterAlertLevel = 'normal';
    let ratio = 0;
    let thresholdLabel = '';
    if (percent > EARLY_WARNING_THRESHOLDS.ridOverflowCriticalPercent) {
      hazard = 'flood';
      level = 'critical';
      ratio = (percent - 100) / 25;
      thresholdLabel = `เกินความจุเก็บกัก (> ${EARLY_WARNING_THRESHOLDS.ridOverflowCriticalPercent}%)`;
    } else if (percent > EARLY_WARNING_THRESHOLDS.ridOverflowWarningPercent) {
      hazard = 'flood';
      level = 'warning';
      ratio = (percent - 80) / 20;
      thresholdLabel = `สูงกว่าเกณฑ์เฝ้าระวังน้ำมาก (> ${EARLY_WARNING_THRESHOLDS.ridOverflowWarningPercent}%)`;
    } else if (percent < EARLY_WARNING_THRESHOLDS.ridDroughtCriticalPercent) {
      hazard = 'drought';
      level = 'critical';
      ratio = (EARLY_WARNING_THRESHOLDS.ridDroughtCriticalPercent - percent) / 15;
      thresholdLabel = `ต่ำกว่า ${EARLY_WARNING_THRESHOLDS.ridDroughtCriticalPercent}% (ชั้นวิกฤติของเกณฑ์ภายใน)`;
    } else if (percent < EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent) {
      hazard = 'drought';
      level = 'warning';
      ratio = (EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent - percent) / 15;
      thresholdLabel = `ต่ำกว่า ${EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent}% ของความจุเก็บกัก`;
    }
    if (!hazard) continue;

    const pct = round1(percent);
    // น้ำมากเกินเกณฑ์คือ "ระดับน้ำในอ่าง" ไม่ใช่หลักฐานว่าพื้นที่ข้างล่างถูกน้ำท่วม
    const overflowAdvisory = level === 'critical'
      ? 'ระดับน้ำในอ่างเกินความจุเก็บกักตามรายงาน RID: เตรียมรองรับการระบายน้ำผ่านสปิลเวย์/ประตูน้ำ แจ้งเตือนพื้นที่ท้ายน้ำและเกษตรกรรอบอ่าง และตรวจความพร้อมอาคารชลประทาน — เป็นคำแนะนำภายในของ TADIH'
      : 'ระดับน้ำในอ่างเข้าชั้นใกล้ความจุตามรายงาน RID: ทบทวนแผนระบายน้ำก่อนฝนรอบถัดไป และเฝ้าติดตามระดับน้ำท้ายอ่าง — เป็นคำแนะนำภายในของ TADIH';

    alerts.push({
      id: `rid:${row.reservoirId}:${hazard}`,
      sourceId: 'rid',
      badge: RISK_SIGNAL_SOURCES.rid.badge,
      sourceName: RISK_SIGNAL_SOURCES.rid.sourceName,
      hazard,
      level,
      score: tierScore(level, ratio),
      provinceCode: null,
      provinceName: null,
      region: row.region,
      locationId: row.reservoirId,
      locationName: name,
      metricId: 'reservoir_storage_pct',
      metricLabel: 'สัดส่วนน้ำเทียบกับความจุเก็บกัก',
      metricValue: pct,
      metricUnit: '%',
      thresholdLabel,
      evidenceText:
        `${name} รายงานสัดส่วนน้ำ ${formatNumber(pct)}% ของความจุเก็บกัก (${volumeText})`
        + ` ในรอบรายงาน ${row.reportDate ?? 'ไม่ระบุวันที่'}`,
      advisoryText: hazard === 'flood' ? overflowAdvisory : RISK_ADVISORY.drought[level],
      observedAt: row.reportDate ?? reservoirs.reportDate,
      provenance: provenanceFor(
        'rid',
        reservoirs.runId,
        reservoirs.sourceUpdatedAt,
        reservoirs.reportDate ?? null,
      ),
    });
  }

  return alerts;
}

function classifyFloodArea(floodedRai: number, riceRai: number | null): {
  level: DisasterAlertLevel;
  score: number;
  thresholdLabel: string;
} {
  const rice = riceRai ?? 0;
  if (floodedRai >= EARLY_WARNING_THRESHOLDS.gistdaFloodCriticalRai || rice >= EARLY_WARNING_THRESHOLDS.gistdaRiceCriticalRai) {
    const ratio = Math.max((floodedRai - 2000) / 4000, (rice - 1000) / 2000);
    return {
      level: 'critical',
      score: tierScore('critical', ratio),
      thresholdLabel: `พื้นที่ท่วม ≥ ${EARLY_WARNING_THRESHOLDS.gistdaFloodCriticalRai} ไร่ หรือนาข้าว ≥ ${EARLY_WARNING_THRESHOLDS.gistdaRiceCriticalRai} ไร่`,
    };
  }
  if (floodedRai >= EARLY_WARNING_THRESHOLDS.gistdaFloodWarningRai || rice >= EARLY_WARNING_THRESHOLDS.gistdaRiceWarningRai) {
    const ratio = Math.max((floodedRai - 200) / 1800, (rice - 100) / 900);
    return {
      level: 'warning',
      score: tierScore('warning', ratio),
      thresholdLabel: `พื้นที่ท่วม ≥ ${EARLY_WARNING_THRESHOLDS.gistdaFloodWarningRai} ไร่ หรือนาข้าว ≥ ${EARLY_WARNING_THRESHOLDS.gistdaRiceWarningRai} ไร่`,
    };
  }
  if (floodedRai >= EARLY_WARNING_THRESHOLDS.gistdaFloodWatchRai) {
    return { level: 'normal', score: 45, thresholdLabel: `ตรวจพบ polygon (${EARLY_WARNING_THRESHOLDS.gistdaFloodWatchRai}–${EARLY_WARNING_THRESHOLDS.gistdaFloodWarningRai - 1} ไร่ — ต่ำกว่าเกณฑ์ภายใน)` };
  }
  return { level: 'normal', score: 25, thresholdLabel: 'ตรวจพบ polygon ขนาดเล็กกว่าเกณฑ์เฝ้าระวังภายใน' };
}

function buildFloodAlerts(bundle: EarlyWarningEvidenceBundle, names: Map<string, string>): RiskAlertItem[] {
  const flood = bundle.flood;
  if (!flood) return [];

  return flood.rows.map((row) => {
    const classification = classifyFloodArea(row.floodedAreaRai, row.riceAreaRai);
    const provinceName = row.provinceNameTh || provinceNameFor(row.provinceCode, names);
    const riceText = row.riceAreaRai === null
      ? ' polygon บางผืนไม่มีค่านาข้าว (missing ไม่ใช่ 0)'
      : ` เป็นนาข้าว ${formatNumber(row.riceAreaRai, 2)} ไร่`;

    return {
      id: `gistda:${row.provinceCode}:flood`,
      sourceId: 'gistda',
      badge: RISK_SIGNAL_SOURCES.gistda.badge,
      sourceName: RISK_SIGNAL_SOURCES.gistda.sourceName,
      hazard: 'flood',
      level: classification.level,
      score: classification.score,
      provinceCode: row.provinceCode,
      provinceName,
      region: GEO_REFERENCE.get(row.provinceCode)?.region ?? null,
      locationId: row.provinceCode,
      locationName: provinceName,
      metricId: 'gistda_inundated_area_rai',
      metricLabel: 'พื้นที่น้ำท่วมจาก polygon รวมทั้งจังหวัด',
      metricValue: round1(row.floodedAreaRai),
      metricUnit: 'ไร่',
      thresholdLabel: classification.thresholdLabel,
      evidenceText:
        `GISTDA ตรวจพบ polygon น้ำท่วม ${row.polygonCount} ผืนใน ${provinceName} รวม ${formatNumber(round1(row.floodedAreaRai))} ไร่ `
        + `(${formatNumber(row.floodedAreaSqKm, 3)} ตร.กม.)${riceText} ในหน้าต่าง 7 วัน · เซนเซอร์ ${row.satelliteSources.join(', ') || 'ไม่ระบุ'} · โหมด ${flood.sourceMode}`,
      advisoryText: RISK_ADVISORY.flood[classification.level],
      observedAt: flood.retrievedAt,
      provenance: provenanceFor('gistda', null, flood.snapshotRetrievedAt, flood.retrievedAt),
    };
  });
}

function buildWeatherAlerts(bundle: EarlyWarningEvidenceBundle, names: Map<string, string>): RiskAlertItem[] {
  const weather = bundle.weather;
  if (!weather) return [];
  const alerts: RiskAlertItem[] = [];

  for (const station of weather.rows) {
    const provinceName = station.provinceCode
      ? (station.provinceNameTh || provinceNameFor(station.provinceCode, names))
      : null;
    const stationName = station.stationNameTh ?? station.stationCode;
    const location = `${stationName} (${station.stationCode}, เครือข่าย ${station.network})`;
    const observedAt = station.observedAtIct ?? `${weather.observationDate}T07:00:00+07:00`;
    const unitsConfirmed = hasConfirmedUnit(station.unitStatus);

    const rain = station.rainfallMm;
    if (unitsConfirmed && rain !== null && Number.isFinite(rain) && rain >= EARLY_WARNING_THRESHOLDS.tmdHeavyRainMm) {
      const critical = rain >= EARLY_WARNING_THRESHOLDS.tmdVeryHeavyRainMm;
      const level: DisasterAlertLevel = critical ? 'critical' : 'warning';
      const ratio = critical
        ? (rain - EARLY_WARNING_THRESHOLDS.tmdVeryHeavyRainMm) / 60
        : (rain - EARLY_WARNING_THRESHOLDS.tmdHeavyRainMm) / 55;
      alerts.push({
        id: `tmd:${station.stationCode}:rainfall`,
        sourceId: 'tmd',
        badge: RISK_SIGNAL_SOURCES.tmd.badge,
        sourceName: RISK_SIGNAL_SOURCES.tmd.sourceName,
        hazard: 'flood',
        level,
        score: tierScore(level, ratio),
        provinceCode: station.provinceCode,
        provinceName,
        region: station.provinceCode ? (GEO_REFERENCE.get(station.provinceCode)?.region ?? null) : null,
        locationId: station.stationCode,
        locationName: stationName,
        metricId: 'rainfall_mm',
        metricLabel: 'ปริมาณน้ำฝนรายวันของสถานี',
        metricValue: round1(rain),
        metricUnit: 'มม. (ตามที่ต้นทางรายงาน)',
        thresholdLabel: critical
          ? `ฝนหนักมาก (≥ ${EARLY_WARNING_THRESHOLDS.tmdVeryHeavyRainMm} มม./วัน)`
          : `ฝนหนัก (≥ ${EARLY_WARNING_THRESHOLDS.tmdHeavyRainMm} มม./วัน)`,
        evidenceText: `สถานี ${location} ตรวจวัดปริมาณน้ำฝน ${formatNumber(round1(rain))} มม. เมื่อวันที่ ${weather.observationDate}`,
        advisoryText: RISK_ADVISORY.flood[level],
        observedAt,
        provenance: provenanceFor('tmd', weather.runId, weather.sourceUpdatedAt, weather.observationDate),
      });
    }

    const tmax = station.maxTemperatureC;
    if (unitsConfirmed && tmax !== null && Number.isFinite(tmax) && tmax >= EARLY_WARNING_THRESHOLDS.tmdHotMaxC) {
      const critical = tmax >= EARLY_WARNING_THRESHOLDS.tmdVeryHotMaxC;
      const level: DisasterAlertLevel = critical ? 'critical' : 'warning';
      const ratio = critical
        ? (tmax - EARLY_WARNING_THRESHOLDS.tmdVeryHotMaxC) / 6
        : (tmax - EARLY_WARNING_THRESHOLDS.tmdHotMaxC) / 3;
      alerts.push({
        id: `tmd:${station.stationCode}:tmax`,
        sourceId: 'tmd',
        badge: RISK_SIGNAL_SOURCES.tmd.badge,
        sourceName: RISK_SIGNAL_SOURCES.tmd.sourceName,
        hazard: 'heat',
        level,
        score: tierScore(level, ratio),
        provinceCode: station.provinceCode,
        provinceName,
        region: station.provinceCode ? (GEO_REFERENCE.get(station.provinceCode)?.region ?? null) : null,
        locationId: station.stationCode,
        locationName: stationName,
        metricId: 'tmax_c',
        metricLabel: 'อุณหภูมิสูงสุดของสถานี',
        metricValue: round1(tmax),
        metricUnit: '°C (ตามที่ต้นทางรายงาน)',
        thresholdLabel: critical
          ? `ร้อนจัดมาก (≥ ${EARLY_WARNING_THRESHOLDS.tmdVeryHotMaxC} °C)`
          : `ร้อนจัด (≥ ${EARLY_WARNING_THRESHOLDS.tmdHotMaxC} °C)`,
        evidenceText: `สถานี ${location} ตรวจวัดอุณหภูมิสูงสุด ${formatNumber(round1(tmax))} °C เมื่อวันที่ ${weather.observationDate}`,
        advisoryText: RISK_ADVISORY.heat[level],
        observedAt,
        provenance: provenanceFor('tmd', weather.runId, weather.sourceUpdatedAt, weather.observationDate),
      });
    }
  }

  return alerts;
}

const LEVEL_ORDER: Record<DisasterAlertLevel, number> = { critical: 0, warning: 1, normal: 2 };

/** รวมสัญญาณจากทั้งสามชั้นตรวจวัด เรียงจากวิกฤติไปหาปกติแล้วตามด้วยคะแนน */
export function buildRiskAlerts(
  bundle: EarlyWarningEvidenceBundle,
  provinceNames: Map<string, string>,
): RiskAlertItem[] {
  const alerts = [
    ...buildReservoirAlerts(bundle),
    ...buildFloodAlerts(bundle, provinceNames),
    ...buildWeatherAlerts(bundle, provinceNames),
  ];

  return alerts.sort((left, right) =>
    LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level]
    || right.score - left.score
    || left.id.localeCompare(right.id));
}

/**
 * Filters the published signal list. `type=flood|drought` keeps the matching
 * hazard only; a `heat` signal is never hidden under `type=all`. `sourceId`
 * selects one measured layer (RID / GISTDA / TMD).
 */
export function filterRiskSignals(
  rows: RiskAlertItem[],
  options?: {
    region?: string;
    risk?: string;
    type?: RiskType;
    sourceId?: RiskSignalSourceId | 'all';
    provinceCode?: string;
    query?: string;
  },
): RiskAlertItem[] {
  let list = [...rows];

  if (options?.region && options.region !== 'all') {
    list = list.filter((alert) => alert.region === options.region);
  }

  if (options?.risk && options.risk !== 'all') {
    list = list.filter((alert) => alert.level === options.risk);
  }

  if (options?.type && options.type !== 'all') {
    list = list.filter((alert) => alert.hazard === options.type);
  }

  if (options?.sourceId && options.sourceId !== 'all') {
    list = list.filter((alert) => alert.sourceId === options.sourceId);
  }

  if (options?.provinceCode) {
    list = list.filter((alert) => alert.provinceCode === options.provinceCode);
  }

  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    list = list.filter((alert) =>
      (alert.provinceName ?? '').toLowerCase().includes(q)
      || (alert.locationName ?? '').toLowerCase().includes(q)
      || alert.locationId.toLowerCase().includes(q)
      || alert.badge.toLowerCase().includes(q)
      || (alert.region ?? '').toLowerCase().includes(q));
  }

  return list;
}

/* ------------------------- province aggregation ------------------------ */

function urgencyFromLevel(level: DisasterAlertLevel): ProvinceRiskItem['urgency'] {
  if (level === 'critical') return 'urgent';
  if (level === 'warning') return 'warning';
  return 'watch';
}

/**
 * Provincial rows built only from published evidence.
 *
 * A reservoir is not a province, so RID drought context is attached by the
 * source's own `region` label and is named as region context in the row's
 * `droughtBasis`. A station is not a province either: `rainfall7dMm` carries the
 * single highest **unit-confirmed** station daily value of the observation date
 * and `rainfallBasis` says so. Drought stays `null`/unknown until a provincial
 * input exists, and heat severity participates in `overallRisk`/`urgency`.
 * Provinces with no published evidence are absent — never zero-filled.
 */
export function buildEvidenceProvinces(
  alerts: RiskAlertItem[],
  bundle: EarlyWarningEvidenceBundle,
  provinceNames: Map<string, string>,
): ProvinceRiskItem[] {
  const codes = new Set<string>();
  for (const alert of alerts) {
    if (alert.provinceCode) codes.add(alert.provinceCode);
  }

  const regionDroughtContext = new Map<string, { score: number; level: DisasterAlertLevel; name: string }>();
  for (const alert of alerts) {
    if (alert.sourceId !== 'rid' || alert.hazard !== 'drought' || !alert.region) continue;
    const current = regionDroughtContext.get(alert.region);
    if (!current || alert.score > current.score) {
      regionDroughtContext.set(alert.region, {
        score: alert.score,
        level: alert.level,
        name: alert.locationName ?? alert.locationId,
      });
    }
  }

  const byProvince = new Map<string, RiskAlertItem[]>();
  for (const alert of alerts) {
    if (!alert.provinceCode) continue;
    const list = byProvince.get(alert.provinceCode) ?? [];
    list.push(alert);
    byProvince.set(alert.provinceCode, list);
  }

  // Rainfall is only interpreted in mm when the station unit is confirmed; a
  // pending raw value is counted so the row can explain the hold instead of 0.
  const stationRainByProvince = new Map<string, { confirmed: number[]; pendingCount: number }>();
  for (const station of bundle.weather?.rows ?? []) {
    if (!station.provinceCode) continue;
    const rain = station.rainfallMm;
    if (rain === null || !Number.isFinite(rain)) continue;
    const bucket = stationRainByProvince.get(station.provinceCode)
      ?? { confirmed: [], pendingCount: 0 };
    if (hasConfirmedUnit(station.unitStatus)) bucket.confirmed.push(rain);
    else bucket.pendingCount += 1;
    stationRainByProvince.set(station.provinceCode, bucket);
  }

  const rows: ProvinceRiskItem[] = [];
  for (const code of [...codes].sort()) {
    const own = byProvince.get(code) ?? [];
    const reference = GEO_REFERENCE.get(code);
    const floodSignals = own.filter((alert) => alert.hazard === 'flood');
    const heatSignals = own.filter((alert) => alert.hazard === 'heat');
    const rainSignals = floodSignals.filter((alert) => alert.sourceId === 'tmd');
    const polygonSignals = floodSignals.filter((alert) => alert.sourceId === 'gistda');

    const floodRiskScore = floodSignals.length ? floodSignals.reduce((max, alert) => Math.max(max, alert.score), 0) : null;
    const floodRiskLevel = floodRiskScore === null ? null : levelFromScore(floodRiskScore);

    const heatRiskScore = heatSignals.length
      ? heatSignals.reduce((max, alert) => Math.max(max, alert.score), 0)
      : null;
    const heatRiskLevel = heatRiskScore === null ? null : levelFromScore(heatRiskScore);

    const context = reference?.region ? regionDroughtContext.get(reference.region) : undefined;
    const droughtRiskScore = context ? context.score : null;
    const droughtRiskLevel = context ? context.level : null;

    const knownLevels = [
      floodRiskLevel,
      ...(heatRiskLevel ? [heatRiskLevel] : []),
      ...(droughtRiskLevel ? [droughtRiskLevel] : []),
    ];
    const overallRisk: DisasterAlertLevel = knownLevels.includes('critical')
      ? 'critical'
      : knownLevels.includes('warning')
        ? 'warning'
        : 'normal';

    const stationRain = stationRainByProvince.get(code);
    const confirmedRainValues = stationRain?.confirmed ?? [];
    const rainfall7dMm = confirmedRainValues.length ? round1(Math.max(...confirmedRainValues)) : null;
    const polygonArea = polygonSignals.reduce((sum, alert) => sum + (alert.metricValue ?? 0), 0);
    const riceArea = bundle.flood?.rows.find((row) => row.provinceCode === code)?.riceAreaRai ?? null;

    const advisoryParts: string[] = [];
    if (polygonSignals.length) {
      advisoryParts.push(
        `ตรวจพบ polygon น้ำท่วมจริง ${formatNumber(polygonArea, 0)} ไร่${riceArea === null ? '' : ` (นาข้าว ${formatNumber(riceArea, 0)} ไร่)`}`,
      );
    }
    if (rainfall7dMm !== null) {
      advisoryParts.push(`สถานีในจังหวัดรายงานฝนสูงสุด ${formatNumber(rainfall7dMm)} มม./วัน`);
    }
    if (heatSignals.length) {
      advisoryParts.push(`สถานีในจังหวัดรายงานอุณหภูมิสูงสุด ${formatNumber(Math.max(...heatSignals.map((s) => s.metricValue ?? 0)))} °C`);
    }
    if (context) {
      advisoryParts.push(`บริบทภูมิภาค: อ่าง ${context.name} ใน${reference?.region}อยู่ชั้น ${context.level}`);
    }
    if (!advisoryParts.length) advisoryParts.push('ไม่มีหลักฐานตรวจวัดในจังหวัดนี้ในรอบข้อมูลปัจจุบัน');

    const actions: string[] = [];
    if (polygonSignals.length) actions.push('ตรวจสอบแปลงที่ปรากฏใน polygon ตามพิกัดตำบล และถ่ายภาพความเสียหายเป็นหลักฐานประกอบการขอช่วยเหลือ');
    if (rainSignals.length) actions.push('เปิดทางระบายน้ำในแปลงและงดใส่ปุ๋ย/สารเคมีก่อนรอบฝนหนักถัดไป');
    if (heatSignals.length) actions.push('คลุมดิน/โรงเรือนและเพิ่มรอบน้ำให้พืชระยะอ่อนในช่วงอุณหภูมิสูง');
    if (context) actions.push('ทบทวนแผนจัดสรรน้ำของแหล่งน้ำในภูมิภาคเดียวกันก่อนเริ่มรอบปลูกใหม่');
    if (!actions.length) actions.push('ติดตามสัญญาณรอบข้อมูลถัดไป — ยังไม่มีหลักฐานตรวจวัดที่ต้องมาตรการ');

    rows.push({
      provinceCode: code,
      provinceName: provinceNames.get(code) ?? polygonSignals[0]?.provinceName ?? code,
      region: reference?.region ?? UNKNOWN_REGION_LABEL,
      basinName: reference?.basinName ?? UNKNOWN_BASIN_LABEL,
      overallRisk,
      floodRiskScore,
      floodRiskLevel,
      droughtRiskScore,
      droughtRiskLevel,
      heatRiskScore,
      heatRiskLevel,
      rainfall7dMm,
      soilMoisturePercent: null,
      reservoirStoragePercent: null,
      affectedCrops: reference ? reference.crops : [],
      agriculturalAdvisory: `${advisoryParts.join(' · ')} — ดัชนีความเสี่ยงเป็นเกณฑ์วิเคราะห์ภายในของ TADIH`,
      recommendedActions: actions,
      urgency: urgencyFromLevel(overallRisk),
      keyReservoirs: [],
      signalIds: own.map((alert) => alert.id),
      evidenceSources: [...new Set(own.map((alert) => alert.sourceId))],
      rainfallBasis: rainfall7dMm !== null
        ? 'ค่าสูงสุดของสถานีที่รายงานในวันตรวจวัดเดียว (station × day) ไม่ใช่ฝนสะสม 7 วันระดับจังหวัด'
        : (stationRain?.pendingCount ?? 0) > 0
          ? 'สถานีในจังหวัดนี้รายงานปริมาณฝนแต่หน่วยยังไม่ได้รับการยืนยัน จึงไม่แปลงเป็น มม. (ยังไม่ทราบ ไม่ใช่ 0)'
          : 'ไม่มีสถานีที่รายงานปริมาณฝนในจังหวัดนี้สำหรับวันนี้ (absent ไม่ใช่ฝนเป็น 0)',
      droughtBasis: context
        ? `บริบทรายภูมิภาค (${reference?.region}) จากอ่างเก็บน้ำ RID ที่มีระดับน้ำต่ำที่สุด — ไม่ใช่ค่าของจังหวัดนี้โดยตรง`
        : 'ยังไม่มีข้อมูลตรวจวัดระดับจังหวัดที่ป้อนดัชนีภัยแล้ง (ข้อมูลอ่างเก็บน้ำอยู่กับระดับรายอ่างเท่านั้น)',
      observedAt: own.map((alert) => alert.observedAt).filter((value): value is string => typeof value === 'string').sort().at(-1) ?? null,
      observed: true,
    });
  }

  const evidenceScore = (row: ProvinceRiskItem) =>
    Math.max(row.floodRiskScore ?? 0, row.heatRiskScore ?? 0, row.droughtRiskScore ?? 0);

  return rows.sort((left, right) =>
    LEVEL_ORDER[left.overallRisk] - LEVEL_ORDER[right.overallRisk]
    || evidenceScore(right) - evidenceScore(left)
    || left.provinceCode.localeCompare(right.provinceCode));
}

/* ------------------------------ summary ------------------------------- */

function levelCount(rows: ProvinceRiskItem[], level: DisasterAlertLevel): number {
  return rows.filter((row) => row.overallRisk === level).length;
}

export function buildEvidenceSummary(
  bundle: EarlyWarningEvidenceBundle,
  alerts: RiskAlertItem[],
  provinces: ProvinceRiskItem[],
): EarlyWarningSummary {
  const reservoirPercents = (bundle.reservoirs?.rows ?? [])
    .map((row) => row.storagePercent)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const overflowCount = reservoirPercents.filter((value) => value > EARLY_WARNING_THRESHOLDS.ridOverflowWarningPercent).length;
  const droughtCount = reservoirPercents.filter((value) => value < EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent).length;

  const weatherRows = bundle.weather?.rows ?? [];
  const rainValues = weatherRows
    .filter((station) => hasConfirmedUnit(station.unitStatus))
    .map((station) => station.rainfallMm)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const pendingRainStations = weatherRows.filter((station) =>
    !hasConfirmedUnit(station.unitStatus)
    && station.rainfallMm !== null
    && Number.isFinite(station.rainfallMm)).length;
  const polygonProvinces = alerts.filter((alert) => alert.sourceId === 'gistda');
  const criticalCount = alerts.filter((alert) => alert.level === 'critical').length;
  const warningCount = alerts.filter((alert) => alert.level === 'warning').length;

  const reportDate = bundle.reservoirs?.reportDate
    ?? bundle.weather?.observationDate
    ?? bundle.flood?.snapshotRetrievedAt?.slice(0, 10)
    ?? null;

  const headlineParts: string[] = [];
  if (bundle.reservoirs) {
    headlineParts.push(`อ่างเกิน ${EARLY_WARNING_THRESHOLDS.ridOverflowWarningPercent}% จำนวน ${overflowCount} แห่ง`);
    headlineParts.push(`อ่างต่ำกว่า ${EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent}% จำนวน ${droughtCount} แห่ง`);
  }
  if (bundle.flood) headlineParts.push(`จังหวัดที่พบ polygon น้ำท่วม ${polygonProvinces.length} แห่ง`);
  if (bundle.weather) headlineParts.push(`สัญญาณจากสถานีอากาศ ${alerts.filter((alert) => alert.sourceId === 'tmd').length} รายการ`);

  return {
    totalReservoirs: reservoirPercents.length,
    criticalFloodCount: overflowCount,
    criticalDroughtCount: droughtCount,
    safeReservoirsCount: Math.max(0, reservoirPercents.length - overflowCount - droughtCount),
    highRiskProvincesCount: levelCount(provinces, 'critical'),
    warningProvincesCount: levelCount(provinces, 'warning'),
    normalProvincesCount: levelCount(provinces, 'normal'),
    avgRainfall7dMm: rainValues.length ? round1(rainValues.reduce((sum, value) => sum + value, 0) / rainValues.length) : null,
    maxRainfall7dMm: rainValues.length ? round1(Math.max(...rainValues)) : null,
    rainfallBasis: rainValues.length
      ? `ค่าเฉลี่ย/ค่าสูงสุดของปริมาณน้ำฝนรายวันที่สถานี ${rainValues.length} แห่งรายงาน (grain: station × day) — ไม่ใช่ฝนสะสม 7 วันระดับจังหวัด`
      : pendingRainStations > 0
        ? `สถานี ${pendingRainStations} แห่งรายงานปริมาณฝนแต่หน่วยยังไม่ได้รับการยืนยัน จึงไม่คำนวณค่า มม. (ยังไม่ทราบ ไม่ใช่ 0 มม.)`
        : 'ไม่มีสถานีที่รายงานปริมาณฝนใน round ข้อมูลนี้ (absent ไม่ใช่ 0 มม.)',
    disasterAlertLevel: criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'normal',
    headline: `${headlineParts.length ? headlineParts.join(' · ') : 'ไม่พบสัญญาณที่ผ่านเกณฑ์ภายในในรอบข้อมูลนี้'} — สัญญาณจริง ${alerts.length} รายการ`,
    subheadline: EARLY_WARNING_ANALYTICS_DISCLAIMER,
    sample: false,
    reportDate: reportDate ?? '',
  };
}

/** Real reservoir rows above/below the internal thresholds, at reservoir grain. */
export function buildEvidenceCriticalReservoirs(bundle: EarlyWarningEvidenceBundle): CriticalReservoir[] {
  const reservoirs = bundle.reservoirs;
  if (!reservoirs) return [];
  const observedAt = reservoirs.reportDate;

  const rows: CriticalReservoir[] = [];
  for (const row of reservoirs.rows) {
    const percent = row.storagePercent;
    if (percent === null || !Number.isFinite(percent)) continue;
    const isOverflow = percent > EARLY_WARNING_THRESHOLDS.ridOverflowWarningPercent;
    const isDrought = percent < EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent;
    if (!isOverflow && !isDrought) continue;

    rows.push({
      id: row.reservoirId,
      name: row.name ?? row.reservoirId,
      region: row.region,
      // ความจุออกแบบไม่ได้อยู่ในชั้น numeric — ห้ามเดาเป็น 0
      storage: null,
      volume: row.volumeMcm,
      percent: round1(percent),
      deadStorage: null,
      inflow: null,
      outflow: null,
      type: isOverflow ? 'overflow' : 'drought',
      riskLabel: isOverflow
        ? `สัดส่วนน้ำ ${formatNumber(round1(percent))}% ของความจุเก็บกัก (> ${EARLY_WARNING_THRESHOLDS.ridOverflowWarningPercent}% เกณฑ์ภายใน)`
        : `สัดส่วนน้ำ ${formatNumber(round1(percent))}% ของความจุเก็บกัก (< ${EARLY_WARNING_THRESHOLDS.ridDroughtWarningPercent}% เกณฑ์ภายใน)`,
      advisoryNote:
        'ค่านี้เป็นระดับน้ำของตัวอ่างตามรายงาน RID ไม่ใช่ระดับน้ำของทั้งจังหวัด และข้อความแนะนำเป็นดัชนีภายในของ TADIH',
      sourceId: 'rid',
      sourceBadge: RISK_SIGNAL_SOURCES.rid.badge,
      sourceName: RISK_SIGNAL_SOURCES.rid.sourceName,
      observedAt,
      volumeUnit: row.volumeUnit ?? 'ล้าน ลบ.ม. (ตามที่ต้นทางรายงาน)',
      capacityStatus: 'capacity_not_published_in_numeric_layer',
      runId: reservoirs.runId,
      sourceRowRef: row.sourceRowRef,
    });
  }

  return rows.sort((left, right) =>
    left.type === right.type
      ? (right.percent ?? 0) - (left.percent ?? 0)
      : left.type.localeCompare(right.type));
}

function sourceBlock(
  id: RiskSignalSourceId,
  options: {
    applied: boolean;
    recordCount: number;
    signalCount: number;
    dataAsOf: string | null;
    sourceUpdatedAt: string | null;
    runId: string | null;
    note: string;
  },
): EarlyWarningSourceBlock {
  const meta = RISK_SIGNAL_SOURCES[id];
  return {
    id,
    badge: meta.badge,
    name: meta.sourceName,
    endpoint: meta.endpoint,
    attribution: meta.attribution,
    grain: meta.grain,
    dataKind: 'observed',
    applied: options.applied,
    recordCount: options.recordCount,
    signalCount: options.signalCount,
    dataAsOf: options.dataAsOf,
    sourceUpdatedAt: options.sourceUpdatedAt,
    runId: options.runId,
    note: options.note,
  };
}

function freshnessFromSource(modifiedAt: string | null, freshnessDays: number | null): Freshness {
  if (!modifiedAt || !freshnessDays || freshnessDays < 1) return 'unknown';
  return Date.now() - Date.parse(modifiedAt) > freshnessDays * 86_400_000 ? 'stale' : 'fresh';
}

function completenessFromRunStatus(status: string | null): Completeness {
  if (status === 'succeeded') return 'complete';
  if (status === 'partial' || status === 'failed') return 'partial';
  return 'unknown';
}

/* ------------------------------ readers ------------------------------- */

/**
 * RID reservoir evidence from the hub's active numeric batch.
 * `null` means "not publishable/ unreadable", which keeps the payload in
 * simulation fallback rather than inventing reservoir numbers.
 */
async function readReservoirEvidence(): Promise<EarlyWarningEvidenceBundle['reservoirs']> {
  try {
    const snapshot = await readWaterSnapshot();
    const payload = snapshot?.payload;
    if (!payload) return null;
    const rows: ReservoirEvidenceRow[] = payload.reservoirs.map((row) => ({
      reservoirId: row.reservoirId,
      name: row.name,
      region: row.region,
      reportDate: row.reportDate,
      volumeMcm: row.volumeMcm,
      volumeUnit: row.volumeUnit,
      storagePercent: row.storagePercent,
      sourceRowRef: row.sourceRowRef,
    }));
    return {
      rows,
      reportDate: payload.summary?.reportDate ?? rows[0]?.reportDate ?? null,
      runId: snapshot.provenance.runId,
      runStatus: snapshot.provenance.runStatus,
      sourceUpdatedAt: snapshot.provenance.sourceUpdatedAt ?? snapshot.provenance.sourceRetrievedAt,
      retrievedAt: snapshot.provenance.sourceRetrievedAt,
      freshnessDays: snapshot.provenance.freshnessDays,
      observationRows: snapshot.provenance.observationRows,
    };
  } catch (error) {
    console.warn('[early-warning] RID reservoir read failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function readWeatherEvidence(): Promise<EarlyWarningEvidenceBundle['weather']> {
  try {
    const snapshot = await readWeatherSnapshot();
    const payload = snapshot?.payload;
    if (!payload || !payload.stations.length) return null;
    const rows: StationEvidenceRow[] = payload.stations.map((station) => ({
      stationCode: station.stationCode,
      stationNameTh: station.stationNameTh,
      network: station.network,
      provinceCode: station.provinceCode,
      provinceNameTh: station.provinceNameTh,
      rainfallMm: station.values.rainfall_mm,
      maxTemperatureC: station.values.tmax_c,
      observedAtIct: station.observedAtIct,
      observationDate: payload.observationDate,
      sourceResourceUrl: station.sourceResourceUrl,
      unitStatus: station.unitStatus,
    }));
    const latestRun = snapshot.batches.at(-1) ?? null;
    return {
      rows,
      observationDate: payload.observationDate,
      runId: latestRun?.runId ?? null,
      sourceUpdatedAt: latestRun?.runCompletedAt ?? latestRun?.sourceRetrievedAt ?? null,
      freshnessDays: snapshot.freshnessDays,
      runStatus: latestRun?.runStatus ?? null,
      networks: payload.summary.networks,
    };
  } catch (error) {
    console.warn('[early-warning] TMD observation read failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * GISTDA flood polygons are loaded lazily so the fallback envelope — and the
 * offline governance test that builds it — never pulls the bundled feed file.
 */
async function readFloodEvidence(): Promise<EarlyWarningEvidenceBundle['flood']> {
  try {
    const satellite = await import('./satellite-data');
    const observation = satellite.getSnapshotFloodObservation();
    return {
      rows: observation.provinces.map((row) => ({
        provinceCode: row.provinceCode,
        provinceNameTh: row.provinceNameTh,
        provinceNameEn: row.provinceNameEn,
        polygonCount: row.polygonCount,
        floodedAreaRai: row.floodedAreaRai,
        floodedAreaSqKm: row.floodedAreaSqKm,
        riceAreaRai: row.riceAreaRai,
        satelliteSources: [...row.satelliteSources],
      })),
      sourceMode: observation.sourceMode,
      retrievedAt: observation.retrievedAt,
      snapshotRetrievedAt: observation.snapshotRetrievedAt,
      polygonCount: observation.polygonCount,
      totalsFloodedAreaRai: observation.totals.floodedAreaRai,
      totalsRiceAreaRai: observation.totals.riceAreaRai,
    };
  } catch (error) {
    console.warn('[early-warning] GISTDA flood layer unavailable', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function loadProvinceNames(): Promise<Map<string, string>> {
  try {
    const { getProvinces } = await import('../provinces');
    const rows = await getProvinces();
    return new Map(rows.map((row) => [row.code, row.name]));
  } catch (error) {
    console.warn('[early-warning] province reference unavailable', error instanceof Error ? error.message : String(error));
    return new Map();
  }
}

/* ---------------------------- dataset builder -------------------------- */

/** Envelope used when no numeric batch is readable — identical to the pinned simulation contract. */
function buildFallbackDataset(): EarlyWarningDataset {
  return {
    mode: 'simulation_fallback',
    sample: true,
    bannerText: SAMPLE_GOVERNANCE.bannerText,
    disclaimer: SAMPLE_GOVERNANCE.disclaimer,
    summary: getEarlyWarningSummary(),
    provinces: getProvinceRisks(),
    forecast14Days: SIMULATION_FORECAST_14_DAYS,
    criticalReservoirs: getCriticalReservoirs(),
    signals: [],
    sources: [
      sourceBlock('rid', {
        applied: false, recordCount: 0, signalCount: 0, dataAsOf: null, sourceUpdatedAt: null, runId: null,
        note: 'อ่านคลังข้อมูลกลางไม่พบ active numeric batch ของรายงานอ่างเก็บน้ำ RID จึงไม่เปิดเผยตัวเลขระดับอ่าง',
      }),
      sourceBlock('gistda', {
        applied: false, recordCount: 0, signalCount: 0, dataAsOf: null, sourceUpdatedAt: null, runId: null,
        note: 'ชั้น polygon น้ำท่วมของ GISTDA ถูกเปิดใช้เฉพาะเมื่อคลังข้อมูลกลางมีค่าตรวจวัดของ RID หรือ TMD เท่านั้น เพื่อไม่ให้ผสมค่าจำลองกับค่าจริงใน payload เดียวกัน',
      }),
      sourceBlock('tmd', {
        applied: false, recordCount: 0, signalCount: 0, dataAsOf: null, sourceUpdatedAt: null, runId: null,
        note: 'อ่านคลังข้อมูลกลางไม่พบ active numeric batch ของสถานีอากาศ TMD จึงไม่เปิดเผยค่าตรวจวัดรายสถานี',
      }),
    ],
    layerGovernance: {
      reservoirs: 'simulated',
      floodSignals: 'unavailable',
      weatherSignals: 'unavailable',
      provincialRiskIndex: 'simulated',
      forecast14Days: 'simulated',
      soilMoisture: 'simulated',
    },
    apiMeta: {
      availability: 'metadata_only',
      freshness: 'unknown',
      completeness: 'unknown',
      access: 'metadata_only',
      sourceIds: ['early-warning-simulation'],
      sourceRetrievedAt: null,
      dataAsOf: null,
      sourceUpdatedAt: null,
      datasetVersion: SAMPLE_GOVERNANCE.version,
      warnings: [
        ...EARLY_WARNING_WARNINGS,
        'รอบข้อมูลนี้ยังไม่พบ active numeric batch ของรายงานอ่างเก็บน้ำ RID หรือสถานีอากาศ TMD ในคลังข้อมูลกลาง ระบบจึงคง envelope จำลองไว้ทั้งก้อน ไม่ปนค่าตรวจวัด',
        EARLY_WARNING_ANALYTICS_DISCLAIMER,
      ],
      runtimeMode: 'source_api_fallback',
    },
  };
}

/**
 * Assemble the early-warning payload from published measurements.
 *
 * The real-evidence mode requires at least one readable numeric batch (RID or
 * TMD). That gate is deliberate: a flood polygon on its own cannot replace the
 * provincial risk matrix, and answering `access: approved_public` while most
 * rows are still simulated would mislead consumers more than the honest
 * `metadata_only` fallback does.
 */
export async function buildEarlyWarningDataset(): Promise<EarlyWarningDataset> {
  const [reservoirs, weather] = await Promise.all([readReservoirEvidence(), readWeatherEvidence()]);
  if (!reservoirs && !weather) return buildFallbackDataset();

  const flood = await readFloodEvidence();
  const provinceNames = await loadProvinceNames();

  const bundle: EarlyWarningEvidenceBundle = { reservoirs, weather, flood };
  const signals = buildRiskAlerts(bundle, provinceNames);
  const provinces = buildEvidenceProvinces(signals, bundle, provinceNames);
  const summary = buildEvidenceSummary(bundle, signals, provinces);
  const criticalReservoirs = buildEvidenceCriticalReservoirs(bundle);

  const asOfValues = [
    ...(reservoirs?.reportDate ? [`${reservoirs.reportDate}T07:00:00+07:00`] : []),
    ...(weather?.observationDate ? [`${weather.observationDate}T07:00:00+07:00`] : []),
    ...(flood?.retrievedAt ? [flood.retrievedAt] : []),
  ].sort();
  const updatedValues = [
    ...(reservoirs?.sourceUpdatedAt ? [reservoirs.sourceUpdatedAt] : []),
    ...(weather?.sourceUpdatedAt ? [weather.sourceUpdatedAt] : []),
    ...(flood?.snapshotRetrievedAt ? [flood.snapshotRetrievedAt] : []),
  ].sort();

  const freshnessValues: Freshness[] = [
    ...(reservoirs ? [freshnessFromSource(reservoirs.sourceUpdatedAt, reservoirs.freshnessDays)] : []),
    ...(weather ? [freshnessFromSource(weather.sourceUpdatedAt, weather.freshnessDays)] : []),
  ];
  const freshnessStatus: Freshness = freshnessValues.includes('stale')
    ? 'stale'
    : freshnessValues.includes('fresh')
      ? 'fresh'
      : 'unknown';

  const runStatuses = [reservoirs?.runStatus ?? null, weather?.runStatus ?? null].filter((value): value is string => value !== null);
  const completenessStatus: Completeness = runStatuses.length && runStatuses.some((status) => status !== 'succeeded')
    ? 'partial'
    : completenessFromRunStatus(runStatuses[0] ?? null);

  const warnings: string[] = [...EARLY_WARNING_REAL_WARNINGS];
  if (!reservoirs) warnings.push('ชั้นอ่างเก็บน้ำ: ไม่พบ active numeric batch ของ RID ในรอบนี้ รายการอ่างจึงว่าง (absent ไม่ใช่ "ไม่มีน้ำท่วม/ไม่มีน้ำน้อย")');
  if (!weather) warnings.push('ชั้นสถานีอากาศ: ไม่พบ active numeric batch ของ TMD ในรอบนี้ สัญญาณฝน/อุณหภูมิจึงไม่ปรากฏ');
  if (!flood) warnings.push('ชั้น polygon น้ำท่วม: ไม่สามารถเปิดใช้ไฟล์ GISTDA ได้ในรันไทม์นี้ ดัชนีน้ำท่วมจึงอิงฝนจากสถานีเท่านั้น');
  if (runStatuses.some((status) => status === 'partial')) warnings.push('มีรอบข้อมูลที่สถานะ partial: ต้นทางตอบไม่ครบทุกบันทึกในรอบนี้');
  if (provinceNames.size === 0) warnings.push('ทะเบียนรหัสจังหวัดอ้างอิงอ่านไม่สำเร็จ ชื่อจังหวัดบางส่วนแสดงเป็นรหัส DOPA');

  return {
    mode: 'real_evidence',
    sample: false,
    bannerText: EARLY_WARNING_REAL_BANNER,
    disclaimer: EARLY_WARNING_ANALYTICS_DISCLAIMER,
    summary,
    provinces,
    forecast14Days: SIMULATION_FORECAST_14_DAYS,
    criticalReservoirs,
    signals,
    sources: [
      sourceBlock('rid', {
        applied: reservoirs !== null,
        recordCount: reservoirs?.rows.length ?? 0,
        signalCount: signals.filter((alert) => alert.sourceId === 'rid').length,
        dataAsOf: reservoirs?.reportDate ?? null,
        sourceUpdatedAt: reservoirs?.sourceUpdatedAt ?? null,
        runId: reservoirs?.runId ?? null,
        note: reservoirs
          ? `ระดับน้ำรายอ่างจาก active numeric batch (${reservoirs.observationRows} แถวสังเกต)`
          : 'ไม่พบ active numeric batch ของ RID ในคลังข้อมูลกลางรอบนี้',
      }),
      sourceBlock('gistda', {
        applied: flood !== null,
        recordCount: flood?.rows.length ?? 0,
        signalCount: signals.filter((alert) => alert.sourceId === 'gistda').length,
        dataAsOf: flood?.retrievedAt ?? null,
        sourceUpdatedAt: flood?.snapshotRetrievedAt ?? null,
        runId: null,
        note: flood
          ? `${flood.polygonCount} polygon รวมเป็น ${flood.rows.length} จังหวัด · น้ำท่วม ${formatNumber(flood.totalsFloodedAreaRai, 2)} ไร่ · นาข้าว ${flood.totalsRiceAreaRai === null ? 'ไม่ครบทุก polygon' : `${formatNumber(flood.totalsRiceAreaRai, 2)} ไร่`} (โหมด ${flood.sourceMode})`
          : 'เปิดใช้ชั้น polygon ไม่ได้ในรันไทม์นี้',
      }),
      sourceBlock('tmd', {
        applied: weather !== null,
        recordCount: weather?.rows.length ?? 0,
        signalCount: signals.filter((alert) => alert.sourceId === 'tmd').length,
        dataAsOf: weather?.observationDate ?? null,
        sourceUpdatedAt: weather?.sourceUpdatedAt ?? null,
        runId: weather?.runId ?? null,
        note: weather
          ? `สถานีรายงาน ${weather.rows.length} สถานี (${weather.networks.join(', ')}) สำหรับวัน ${weather.observationDate}`
          : 'ไม่พบ active numeric batch ของสถานีอากาศในคลังข้อมูลกลางรอบนี้',
      }),
    ],
    layerGovernance: {
      reservoirs: reservoirs ? 'observed' : 'simulated',
      floodSignals: flood ? 'observed' : 'unavailable',
      weatherSignals: weather ? 'observed' : 'unavailable',
      provincialRiskIndex: 'observed_derived',
      forecast14Days: 'simulated',
      soilMoisture: 'simulated',
    },
    apiMeta: {
      availability: signals.length ? 'ready' : 'empty',
      freshness: freshnessStatus,
      completeness: completenessStatus,
      access: 'approved_public',
      sourceIds: [
        ...(reservoirs ? ['rid'] : []),
        ...(flood ? ['gistda'] : []),
        ...(weather ? ['tmd'] : []),
      ],
      sourceRetrievedAt: flood?.retrievedAt ?? null,
      dataAsOf: asOfValues[0] ?? null,
      sourceUpdatedAt: updatedValues.at(-1) ?? null,
      datasetVersion: reservoirs?.runId ?? weather?.runId ?? flood?.snapshotRetrievedAt ?? null,
      warnings,
      runtimeMode: 'database',
    },
  };
}
