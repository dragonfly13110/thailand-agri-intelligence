/**
 * Early-warning dashboard simulation data.
 *
 * Every value in this module is a deterministic synthetic simulation for the
 * demo dashboard. It does **not** import or reuse the RID reservoir snapshot
 * while that resource stays `pending`; reservoir rows are generated locally
 * from a seeded hash and carry synthetic names/IDs.
 */

export type DisasterAlertLevel = 'critical' | 'warning' | 'normal';
export type RiskType = 'flood' | 'drought' | 'all';

export interface EarlyWarningSummary {
  totalReservoirs: number;
  criticalFloodCount: number; // >80%
  criticalDroughtCount: number; // <30%
  safeReservoirsCount: number; // 30-80%
  highRiskProvincesCount: number;
  warningProvincesCount: number;
  normalProvincesCount: number;
  avgRainfall7dMm: number;
  maxRainfall7dMm: number;
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
  floodRiskScore: number; // 0-100
  floodRiskLevel: DisasterAlertLevel;
  droughtRiskScore: number; // 0-100
  droughtRiskLevel: DisasterAlertLevel;
  rainfall7dMm: number;
  soilMoisturePercent: number; // %
  reservoirStoragePercent: number;
  affectedCrops: string[];
  agriculturalAdvisory: string;
  recommendedActions: string[];
  urgency: 'urgent' | 'warning' | 'watch';
  keyReservoirs: string[];
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
  region: string;
  storage: number;
  volume: number;
  percent: number;
  deadStorage: number;
  inflow: number | null;
  outflow: number | null;
  type: 'overflow' | 'drought';
  riskLabel: string;
  advisoryNote: string;
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

  const totalRainfall = PROVINCIAL_RISK_DATA.reduce((sum, p) => sum + p.rainfall7dMm, 0);
  const avgRainfall = Math.round((totalRainfall / PROVINCIAL_RISK_DATA.length) * 10) / 10;
  const maxRainfall = Math.max(...PROVINCIAL_RISK_DATA.map((p) => p.rainfall7dMm));

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
    disasterAlertLevel: 'warning',
    headline: `แบบจำลองสาธิต: อ่างจำลองเกิน 80% จำนวน ${over80.length} แห่ง และต่ำกว่า 30% จำนวน ${under30.length} แห่ง (ข้อมูลสังเคราะห์)`,
    subheadline:
      'ค่าทั้งหมดสร้างจากแบบจำลองเชิงโครงสร้างเพื่อทดสอบหน้าจอเท่านั้น ไม่ได้มาจากรายงานอ่างเก็บน้ำจริงและไม่ใช่ประกาศเตือนภัย',
    sample: true,
    reportDate: '2026-10-25',
  };
}

/**
 * ดึงรายการจังหวัดความเสี่ยง พร้อมระบบกรอง Region / Risk / Type / Search
 */
export function getProvinceRisks(options?: {
  region?: string;
  risk?: string;
  query?: string;
  type?: RiskType;
}): ProvinceRiskItem[] {
  let list = [...PROVINCIAL_RISK_DATA];

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

  let combined = [...overflowItems, ...droughtItems];

  if (options?.type === 'overflow') {
    combined = overflowItems;
  } else if (options?.type === 'drought') {
    combined = droughtItems;
  }

  if (options?.region && options?.region !== 'all') {
    combined = combined.filter((r) => r.region === options.region);
  }

  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    combined = combined.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }

  // Sort by percent descending for overflow, ascending for drought
  return combined.sort((a, b) => b.percent - a.percent);
}

export function get14DaySimulationForecast(): SimulationForecastDay[] {
  return SIMULATION_FORECAST_14_DAYS;
}
