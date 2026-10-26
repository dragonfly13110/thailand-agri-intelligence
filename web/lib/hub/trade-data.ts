/**
 * Agricultural Trade & Value Chain Data (สถิติการค้าสินค้าเกษตร นำเข้า-ส่งออก และห่วงโซ่มูลค่า)
 *
 * แหล่งอ้างอิงและพิกัดศุลกากร (Harmonized System - HS Code):
 * - กรมศุลกากร (Thai Customs Department): สถิติการค้าระหว่างประเทศรายพิกัด
 * - สำนักงานนโยบายและยุทธศาสตร์การค้า (สนค. TPSO) กระทรวงพาณิชย์
 * - สำนักงานเศรษฐกิจการเกษตร (สศก. OAE) กระทรวงเกษตรและสหกรณ์
 *
 * กติกาและข้อกำหนดข้อมูล:
 * - ตัวเลขสถิติในโมดูลนี้เป็นตัวเลขจำลองเชิงสถิติ (sample: true) ที่อิงกรอบและขนาดจริง
 *   ของการส่งออกสินค้าเกษตรหลักของไทย เพื่อการพัฒนาและการวิเคราะห์ส่วนติดต่อผู้ใช้
 * - ข้อมูลธุรกรรมจริงยังไม่ได้รับสิทธิ์เปิดเผยรายธุรกรรมในระดับสาธารณะ จึงระบุ
 *   access: "metadata_only" และ sample: true เสมอ
 */

export interface TradeDestination {
  rank: number;
  country: string;
  countryCode: string;
  flag: string;
  volumeMillionTons: number;
  valueMillionBaht: number;
  sharePct: number;
}

export interface CostComponent {
  component: string;
  componentEn: string;
  sharePct: number;
  unitAmount: number;
  unit: string;
  description: string;
}

export interface QuarterlyTrade {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  label: string;
  months: string;
  volumeMillionTons: number;
  valueMillionBaht: number;
  yoyGrowthPct: number;
  seasonalFactor: string;
}

export interface CommodityYearData {
  year: number;
  yearBe: number;
  exportVolumeMillionTons: number;
  exportValueMillionBaht: number;
  importVolumeMillionTons: number;
  importValueMillionBaht: number;
  tradeBalanceMillionBaht: number;
  yoyExportValueGrowthPct: number;
  yoyExportVolumeGrowthPct: number;
  fobAvgPriceUsdPerTon: number;
  farmgateAvgPriceThbPerKg: number;
  topDestinations: TradeDestination[];
  costStructure: CostComponent[];
  quarterlyTrends: QuarterlyTrade[];
  keyGateways: Array<{ name: string; sharePct: number; type: 'sea' | 'land' | 'air' }>;
}

export interface CommodityTradeProfile {
  id: string;
  name: string;
  nameEn: string;
  hsCode: string;
  hsSubheadings: string[];
  description: string;
  primaryUnit: string;
  isRisingStar?: boolean;
  years: Record<number, CommodityYearData>;
}

export interface TradeKpiSummary {
  year: number;
  yearBe: number;
  totalExportValueMillionBaht: number;
  totalExportVolumeMillionTons: number;
  totalImportValueMillionBaht: number;
  tradeBalanceMillionBaht: number;
  yoyExportGrowthPct: number;
  /** false เมื่อไม่มีข้อมูลปีก่อนหน้าหรืออัตราการเติบโตต้นทาง — ห้ามเติมค่าประมาณ */
  yoyAvailable: boolean;
  risingStar: {
    id: string;
    name: string;
    hsCode: string;
    yoyGrowthPct: number;
    exportValueMillionBaht: number;
    highlightNote: string;
  };
  topPartner: {
    country: string;
    flag: string;
    totalValueMillionBaht: number;
    sharePct: number;
  };
}

export interface TradeBalanceItem {
  commodityId: string;
  name: string;
  hsCode: string;
  exportValue: number;
  importValue: number;
  tradeBalance: number;
  balanceStatus: 'surplus' | 'deficit';
  exportVolume: number;
}

/**
 * ความครอบคลุมของยอดคู่ค้า: topDestinations เก็บเฉพาะ 5 ตลาดแรกของแต่ละสินค้า
 * สัดส่วนที่แสดงจึงเป็นสัดส่วนของยอดที่ครอบคลุม ไม่ใช่ยอดส่งออกทั้งหมดของทุกตลาด
 */
export interface DestinationCoverage {
  basis: 'top5_per_commodity';
  coveredExportValueMillionBaht: number;
  totalExportValueMillionBaht: number;
  coveragePct: number;
  note: string;
}

export interface TradeDashboardPayload {
  sample: boolean;
  selectedYear: number;
  selectedCommodity: string;
  availableYears: number[];
  availableCommodities: Array<{ id: string; name: string; hsCode: string }>;
  kpi: TradeKpiSummary;
  tradeBalances: TradeBalanceItem[];
  topDestinationsOverall: TradeDestination[];
  destinationCoverage: DestinationCoverage;
  commodityDetail?: CommodityTradeProfile;
  allCommodities: CommodityTradeProfile[];
  meta: {
    access: 'metadata_only';
    availability: 'ready';
    sourceIds: string[];
    sources: Array<{ name: string; org: string; url: string }>;
    dataAsOf: string;
    datasetVersion: string;
    warnings: string[];
  };
}

export const COMMODITY_TRADE_PROFILES: CommodityTradeProfile[] = [
  {
    id: 'rice',
    name: 'ข้าว',
    nameEn: 'Rice',
    hsCode: '1006',
    hsSubheadings: [
      '1006.30 - ข้าวขาวและข้าวหอมมะลิขัดสีหรือสีบางส่วน (Semi-milled or wholly milled rice)',
      '1006.10/20 - ข้าวเปลือกและข้าวกล้อง (Paddy & Husked brown rice)',
      '1006.40 - ปลายข้าว (Broken rice)',
    ],
    description: 'ข้าวไทยเพื่อการส่งออก ประกอบด้วยข้าวขาว 5%, ข้าวหอมมะลิไทย (Thai Hom Mali) ข้าวนึ่ง และข้าวเหนียว',
    primaryUnit: 'ล้านตัน',
    years: {
      2024: {
        year: 2024,
        yearBe: 2567,
        exportVolumeMillionTons: 9.85,
        exportValueMillionBaht: 221500,
        importVolumeMillionTons: 0.045,
        importValueMillionBaht: 1420,
        tradeBalanceMillionBaht: 220080,
        yoyExportValueGrowthPct: 18.2,
        yoyExportVolumeGrowthPct: 12.6,
        fobAvgPriceUsdPerTon: 635,
        farmgateAvgPriceThbPerKg: 11.8,
        topDestinations: [
          { rank: 1, country: 'อินโดนีเซีย', countryCode: 'ID', flag: '🇮🇩', volumeMillionTons: 2.38, valueMillionBaht: 53160, sharePct: 24.0 },
          { rank: 2, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 1.28, valueMillionBaht: 31010, sharePct: 14.0 },
          { rank: 3, country: 'แอฟริกาใต้', countryCode: 'ZA', flag: '🇿🇦', volumeMillionTons: 1.08, valueMillionBaht: 24365, sharePct: 11.0 },
          { rank: 4, country: 'ฟิลิปปินส์', countryCode: 'PH', flag: '🇵🇭', volumeMillionTons: 0.89, valueMillionBaht: 19935, sharePct: 9.0 },
          { rank: 5, country: 'อิรัก', countryCode: 'IQ', flag: '🇮🇶', volumeMillionTons: 0.79, valueMillionBaht: 17720, sharePct: 8.0 },
        ],
        costStructure: [
          { component: 'ต้นทุนผลผลิตหน้าฟาร์ม', componentEn: 'Farm-gate Raw Material', sharePct: 58, unitAmount: 11.8, unit: 'บาท/กก.', description: 'ราคาข้าวเปลือกความชื้น 15% รับซื้อจากเกษตรกร' },
          { component: 'ค่าแปรรูปสีข้าว คัดเกรด และบรรจุ', componentEn: 'Milling, Sorting & Bagging', sharePct: 14, unitAmount: 2.85, unit: 'บาท/กก.', description: 'ค่าสีข้าว อบแห้ง และคัดแยกสิ่งเจือปน/เม็ดเสีย' },
          { component: 'การขนส่งและจัดเก็บคลังสินค้า', componentEn: 'Inland Transport & Silo', sharePct: 12, unitAmount: 2.44, unit: 'บาท/กก.', description: 'ค่าระวางรถบรรทุก/เรือขนส่งสู่ท่าเรือส่งออก' },
          { component: 'พิธีการศุลกากรและค่าภาระท่าเรือ', componentEn: 'Customs & Port Handling', sharePct: 6, unitAmount: 1.22, unit: 'บาท/กก.', description: 'ค่าธรรมเนียมท่าเรือแหลมฉบัง/กรุงเทพ และตรวจสอบคุณภาพ' },
          { component: 'กำไรผู้ส่งออกและประกันภัยทางทะเล', componentEn: 'Margin & Insurance', sharePct: 10, unitAmount: 2.03, unit: 'บาท/กก.', description: 'มาร์จิ้นผู้ส่งออก ความเสี่ยงอัตราแลกเปลี่ยน และประกัน' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 2.46, valueMillionBaht: 55375, yoyGrowthPct: 19.5, seasonalFactor: 'ผลผลิตข้าวนาปีทยอยส่งมอบ ตลาดต่างประเทศเร่งสำรองสต็อก' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 2.58, valueMillionBaht: 58033, yoyGrowthPct: 22.1, seasonalFactor: 'คำสั่งซื้อจากฟิลิปปินส์และอินโดนีเซียเร่งตัวช่วงก่อนมรสุม' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 2.31, valueMillionBaht: 51831, yoyGrowthPct: 14.8, seasonalFactor: 'ช่วงรอยต่อฤดู ข้าวนาปรังช่วยพยุงการส่งมอบ' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 2.50, valueMillionBaht: 56261, yoyGrowthPct: 16.4, seasonalFactor: 'ข้าวหอมมะลิใหม่ฤดูกาล 2567/68 เริ่มออกสู่ตลาดพรีเมียม' },
        ],
        keyGateways: [
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 64, type: 'sea' },
          { name: 'ท่าเรือกรุงเทพ (คลองเตย)', sharePct: 28, type: 'sea' },
          { name: 'ด่านศุลกากรหนองคาย (สู่ สปป.ลาว)', sharePct: 5, type: 'land' },
          { name: 'ด่านอื่นๆ', sharePct: 3, type: 'sea' },
        ],
      },
      2023: {
        year: 2023,
        yearBe: 2566,
        exportVolumeMillionTons: 8.75,
        exportValueMillionBaht: 187400,
        importVolumeMillionTons: 0.042,
        importValueMillionBaht: 1350,
        tradeBalanceMillionBaht: 186050,
        yoyExportValueGrowthPct: 28.4,
        yoyExportVolumeGrowthPct: 13.6,
        fobAvgPriceUsdPerTon: 595,
        farmgateAvgPriceThbPerKg: 10.4,
        topDestinations: [
          { rank: 1, country: 'อินโดนีเซีย', countryCode: 'ID', flag: '🇮🇩', volumeMillionTons: 1.92, valueMillionBaht: 41228, sharePct: 22.0 },
          { rank: 2, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 1.22, valueMillionBaht: 28110, sharePct: 15.0 },
          { rank: 3, country: 'แอฟริกาใต้', countryCode: 'ZA', flag: '🇿🇦', volumeMillionTons: 0.96, valueMillionBaht: 20614, sharePct: 11.0 },
          { rank: 4, country: 'ฟิลิปปินส์', countryCode: 'PH', flag: '🇵🇭', volumeMillionTons: 0.78, valueMillionBaht: 16866, sharePct: 9.0 },
          { rank: 5, country: 'อิรัก', countryCode: 'IQ', flag: '🇮🇶', volumeMillionTons: 0.70, valueMillionBaht: 14992, sharePct: 8.0 },
        ],
        costStructure: [
          { component: 'ต้นทุนผลผลิตหน้าฟาร์ม', componentEn: 'Farm-gate Raw Material', sharePct: 57, unitAmount: 10.4, unit: 'บาท/กก.', description: 'ราคาข้าวเปลือกเฉลี่ยปี 2566' },
          { component: 'ค่าแปรรูปสีข้าว คัดเกรด และบรรจุ', componentEn: 'Milling, Sorting & Bagging', sharePct: 15, unitAmount: 2.73, unit: 'บาท/กก.', description: 'ค่ากระบวนการโรงสี' },
          { component: 'การขนส่งและจัดเก็บคลังสินค้า', componentEn: 'Inland Transport & Silo', sharePct: 12, unitAmount: 2.18, unit: 'บาท/กก.', description: 'ค่าขนส่งและโกดัง' },
          { component: 'พิธีการศุลกากรและค่าภาระท่าเรือ', componentEn: 'Customs & Port Handling', sharePct: 6, unitAmount: 1.09, unit: 'บาท/กก.', description: 'ค่าบริการท่าเทียบเรือ' },
          { component: 'กำไรผู้ส่งออกและประกันภัยทางทะเล', componentEn: 'Margin & Insurance', sharePct: 10, unitAmount: 1.82, unit: 'บาท/กก.', description: 'ผลตอบแทนการค้า' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 2.06, valueMillionBaht: 44100, yoyGrowthPct: 24.2, seasonalFactor: 'อินเดียจำกัดการส่งออกข้าว ทำให้คำสั่งซื้อไหลเข้าไทย' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 2.11, valueMillionBaht: 45163, yoyGrowthPct: 26.5, seasonalFactor: 'ราคาตลาดโลกพุ่งสูงขึ้นอย่างรวดเร็ว' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 2.27, valueMillionBaht: 48537, yoyGrowthPct: 32.1, seasonalFactor: 'ผลพวงจากนโยบายข้าวอินเดียชัดเจนขึ้น' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 2.31, valueMillionBaht: 49600, yoyGrowthPct: 30.2, seasonalFactor: 'ข้าวนาปีเริ่มเข้าสู่ตลาด' },
        ],
        keyGateways: [
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 65, type: 'sea' },
          { name: 'ท่าเรือกรุงเทพ (คลองเตย)', sharePct: 27, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 8, type: 'sea' },
        ],
      },
      2022: {
        year: 2022,
        yearBe: 2565,
        exportVolumeMillionTons: 7.70,
        exportValueMillionBaht: 145900,
        importVolumeMillionTons: 0.038,
        importValueMillionBaht: 1210,
        tradeBalanceMillionBaht: 144690,
        yoyExportValueGrowthPct: 14.5,
        yoyExportVolumeGrowthPct: 22.0,
        fobAvgPriceUsdPerTon: 520,
        farmgateAvgPriceThbPerKg: 9.2,
        topDestinations: [
          { rank: 1, country: 'อิรัก', countryCode: 'IQ', flag: '🇮🇶', volumeMillionTons: 1.62, valueMillionBaht: 30639, sharePct: 21.0 },
          { rank: 2, country: 'แอฟริกาใต้', countryCode: 'ZA', flag: '🇿🇦', volumeMillionTons: 0.92, valueMillionBaht: 17508, sharePct: 12.0 },
          { rank: 3, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.85, valueMillionBaht: 16049, sharePct: 11.0 },
          { rank: 4, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.69, valueMillionBaht: 13131, sharePct: 9.0 },
          { rank: 5, country: 'เบนิน', countryCode: 'BJ', flag: '🇧🇯', volumeMillionTons: 0.46, valueMillionBaht: 8754, sharePct: 6.0 },
        ],
        costStructure: [
          { component: 'ต้นทุนผลผลิตหน้าฟาร์ม', componentEn: 'Farm-gate Raw Material', sharePct: 56, unitAmount: 9.2, unit: 'บาท/กก.', description: 'ราคาข้าวเปลือกปี 2565' },
          { component: 'ค่าแปรรูปสีข้าว คัดเกรด และบรรจุ', componentEn: 'Milling, Sorting & Bagging', sharePct: 15, unitAmount: 2.46, unit: 'บาท/กก.', description: 'ค่าโรงสี' },
          { component: 'การขนส่งและจัดเก็บคลังสินค้า', componentEn: 'Inland Transport & Silo', sharePct: 13, unitAmount: 2.13, unit: 'บาท/กก.', description: 'ต้นทุนคลังและขนส่ง' },
          { component: 'พิธีการศุลกากรและค่าภาระท่าเรือ', componentEn: 'Customs & Port Handling', sharePct: 6, unitAmount: 0.98, unit: 'บาท/กก.', description: 'ค่าธรรมเนียม' },
          { component: 'กำไรผู้ส่งออกและประกันภัยทางทะเล', componentEn: 'Margin & Insurance', sharePct: 10, unitAmount: 1.64, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 1.77, valueMillionBaht: 33557, yoyGrowthPct: 12.0, seasonalFactor: 'การฟื้นตัวของการส่งออกหลังคลี่คลายโควิด-19' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 1.85, valueMillionBaht: 35016, yoyGrowthPct: 13.5, seasonalFactor: 'ตลาดตะวันออกกลางเร่งนำเข้า' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 2.00, valueMillionBaht: 37934, yoyGrowthPct: 15.2, seasonalFactor: 'ความต้องการข้าวขาวเพิ่มขึ้น' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 2.08, valueMillionBaht: 39393, yoyGrowthPct: 16.8, seasonalFactor: 'ฤดูเก็บเกี่ยวปลายปี' },
        ],
        keyGateways: [
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 63, type: 'sea' },
          { name: 'ท่าเรือกรุงเทพ (คลองเตย)', sharePct: 29, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 8, type: 'sea' },
        ],
      },
    },
  },
  {
    id: 'rubber',
    name: 'ยางพารา',
    nameEn: 'Natural Rubber',
    hsCode: '4001',
    hsSubheadings: [
      '4001.22 - ยางแท่งธรรมชาติ (Technically Specified Natural Rubber - TSR/STR20)',
      '4001.21 - ยางแผ่นรมควัน (Smoked sheets - RSS3)',
      '4001.10 - น้ำยางข้นธรรมชาติ (Natural rubber latex)',
      '4001.29 - ยางเครปและยางธรรมชาติรูปแบบอื่น',
    ],
    description: 'ยางธรรมชาติและผลิตภัณฑ์ยางแปรรูปขั้นปฐมของไทย ป้อนอุตสาหกรรมยางล้อรถยนต์และถุงมือแพทย์ทั่วโลก',
    primaryUnit: 'ล้านตัน',
    years: {
      2024: {
        year: 2024,
        yearBe: 2567,
        exportVolumeMillionTons: 4.25,
        exportValueMillionBaht: 208500,
        importVolumeMillionTons: 0.16,
        importValueMillionBaht: 8850,
        tradeBalanceMillionBaht: 199650,
        yoyExportValueGrowthPct: 16.8,
        yoyExportVolumeGrowthPct: 3.4,
        fobAvgPriceUsdPerTon: 1780,
        farmgateAvgPriceThbPerKg: 68.5,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 2.08, valueMillionBaht: 102165, sharePct: 49.0 },
          { rank: 2, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.42, valueMillionBaht: 20850, sharePct: 10.0 },
          { rank: 3, country: 'ญี่ปุ่น', countryCode: 'JP', flag: '🇯🇵', volumeMillionTons: 0.30, valueMillionBaht: 14595, sharePct: 7.0 },
          { rank: 4, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.25, valueMillionBaht: 12510, sharePct: 6.0 },
          { rank: 5, country: 'เกาหลีใต้', countryCode: 'KR', flag: '🇰🇷', volumeMillionTons: 0.21, valueMillionBaht: 10425, sharePct: 5.0 },
        ],
        costStructure: [
          { component: 'น้ำยางดิบและขี้ยางหน้าสวน', componentEn: 'Raw Latex / Field Coagulum', sharePct: 64, unitAmount: 68.5, unit: 'บาท/กก.', description: 'ต้นทุนรับซื้อน้ำยางดิบ/ยางก้อนถ้วยจากเกษตรกรชาวสวนยาง' },
          { component: 'แปรรูปโรงงานยางแท่ง/รมควัน', componentEn: 'Factory Processing & Chemicals', sharePct: 15, unitAmount: 16.05, unit: 'บาท/กก.', description: 'ค่าอบแห้ง รมควัน ผสมสารเคมี และอัดแท่งมาตรฐาน STR20/RSS3' },
          { component: 'ขนส่งภายในประเทศและลานตู้', componentEn: 'Inland Freight & Container Yard', sharePct: 9, unitAmount: 9.63, unit: 'บาท/กก.', description: 'ขนส่งจากภาคใต้/ภาคอีสานสู่ท่าเรือแหลมฉบังและสงขลา' },
          { component: 'เงินสงเคราะห์ CESS และพิธีการศุลกากร', componentEn: 'CESS Fund Tax & Customs', sharePct: 4, unitAmount: 4.28, unit: 'บาท/กก.', description: 'ค่าธรรมเนียมส่งออก CESS สนับสนุนกองทุนสวนยาง' },
          { component: 'มาร์จิ้นผู้ส่งออกและการเงิน', componentEn: 'Exporter Margin & Finance', sharePct: 8, unitAmount: 8.56, unit: 'บาท/กก.', description: 'กำไรผู้ค้า ยางล่วงหน้า และดอกเบี้ยเงินหมุนเวียน' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.98, valueMillionBaht: 47955, yoyGrowthPct: 12.8, seasonalFactor: 'ช่วงฤดูผลัดใบ (ปิดกรีด) ปริมาณวัตถุดิบลดลง ราคาตลาดปรับตัวขึ้น' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 1.02, valueMillionBaht: 50040, yoyGrowthPct: 15.4, seasonalFactor: 'เริ่มเปิดกรีดรอบใหม่ อุตสาหกรรมยานยนต์จีนเร่งสต็อกยางแท่ง' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 1.10, valueMillionBaht: 54210, yoyGrowthPct: 18.2, seasonalFactor: 'ผลผลิตออกสู่ตลาดต่อเนื่อง ส่งมอบตามสัญญาล่วงหน้า' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 1.15, valueMillionBaht: 56295, yoyGrowthPct: 19.6, seasonalFactor: 'ช่วงผลผลิตสูงสุด (Peak Production) ฝนชุกภาคใต้บางช่วงอาจกระทบการกรีด' },
        ],
        keyGateways: [
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 52, type: 'sea' },
          { name: 'ท่าเรือน้ำลึกสงขลา', sharePct: 26, type: 'sea' },
          { name: 'ด่านศุลกากรสะเดา (ไปมาเลเซีย)', sharePct: 16, type: 'land' },
          { name: 'ด่านศุลกากรปาดังเบซาร์', sharePct: 6, type: 'land' },
        ],
      },
      2023: {
        year: 2023,
        yearBe: 2566,
        exportVolumeMillionTons: 4.11,
        exportValueMillionBaht: 178500,
        importVolumeMillionTons: 0.15,
        importValueMillionBaht: 8100,
        tradeBalanceMillionBaht: 170400,
        yoyExportValueGrowthPct: -7.8,
        yoyExportVolumeGrowthPct: -1.2,
        fobAvgPriceUsdPerTon: 1520,
        farmgateAvgPriceThbPerKg: 52.4,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 2.05, valueMillionBaht: 89250, sharePct: 50.0 },
          { rank: 2, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.41, valueMillionBaht: 17850, sharePct: 10.0 },
          { rank: 3, country: 'ญี่ปุ่น', countryCode: 'JP', flag: '🇯🇵', volumeMillionTons: 0.29, valueMillionBaht: 12495, sharePct: 7.0 },
          { rank: 4, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.25, valueMillionBaht: 10710, sharePct: 6.0 },
          { rank: 5, country: 'เกาหลีใต้', countryCode: 'KR', flag: '🇰🇷', volumeMillionTons: 0.20, valueMillionBaht: 8925, sharePct: 5.0 },
        ],
        costStructure: [
          { component: 'น้ำยางดิบและขี้ยางหน้าสวน', componentEn: 'Raw Latex / Field Coagulum', sharePct: 63, unitAmount: 52.4, unit: 'บาท/กก.', description: 'ราคาเฉลี่ยปี 2566' },
          { component: 'แปรรูปโรงงานยางแท่ง/รมควัน', componentEn: 'Factory Processing & Chemicals', sharePct: 15, unitAmount: 12.48, unit: 'บาท/กก.', description: 'ค่าแปรรูป' },
          { component: 'ขนส่งภายในประเทศและลานตู้', componentEn: 'Inland Freight & Container Yard', sharePct: 10, unitAmount: 8.32, unit: 'บาท/กก.', description: 'ค่าขนส่ง' },
          { component: 'เงินสงเคราะห์ CESS และพิธีการศุลกากร', componentEn: 'CESS Fund Tax & Customs', sharePct: 4, unitAmount: 3.33, unit: 'บาท/กก.', description: 'ภาษี CESS' },
          { component: 'มาร์จิ้นผู้ส่งออกและการเงิน', componentEn: 'Margin & Finance', sharePct: 8, unitAmount: 6.65, unit: 'บาท/กก.', description: 'ส่วนต่างกำไร' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 1.05, valueMillionBaht: 45500, yoyGrowthPct: -10.2, seasonalFactor: 'เศรษฐกิจโลกชะลอตัวกดดันราคายาง' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.98, valueMillionBaht: 42500, yoyGrowthPct: -9.5, seasonalFactor: 'สต็อกยางล้อในยุโรปและสหรัฐยังอยู่ในระดับสูง' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 1.01, valueMillionBaht: 43900, yoyGrowthPct: -6.4, seasonalFactor: 'เริ่มฟื้นตัวจากมาตรการกระตุ้นยานยนต์ EV จีน' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 1.07, valueMillionBaht: 46600, yoyGrowthPct: -4.8, seasonalFactor: 'ปลายปียอดสั่งซื้อฟื้นตัวอย่างค่อยเป็นค่อยไป' },
        ],
        keyGateways: [
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 53, type: 'sea' },
          { name: 'ท่าเรือน้ำลึกสงขลา', sharePct: 25, type: 'sea' },
          { name: 'ด่านศุลกากรสะเดา', sharePct: 16, type: 'land' },
          { name: 'ด่านอื่นๆ', sharePct: 6, type: 'land' },
        ],
      },
      2022: {
        year: 2022,
        yearBe: 2565,
        exportVolumeMillionTons: 4.16,
        exportValueMillionBaht: 193600,
        importVolumeMillionTons: 0.14,
        importValueMillionBaht: 7600,
        tradeBalanceMillionBaht: 186000,
        yoyExportValueGrowthPct: 5.6,
        yoyExportVolumeGrowthPct: 1.5,
        fobAvgPriceUsdPerTon: 1650,
        farmgateAvgPriceThbPerKg: 58.0,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 2.12, valueMillionBaht: 98736, sharePct: 51.0 },
          { rank: 2, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.37, valueMillionBaht: 17424, sharePct: 9.0 },
          { rank: 3, country: 'ญี่ปุ่น', countryCode: 'JP', flag: '🇯🇵', volumeMillionTons: 0.29, valueMillionBaht: 13552, sharePct: 7.0 },
          { rank: 4, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.25, valueMillionBaht: 11616, sharePct: 6.0 },
          { rank: 5, country: 'เกาหลีใต้', countryCode: 'KR', flag: '🇰🇷', volumeMillionTons: 0.21, valueMillionBaht: 9680, sharePct: 5.0 },
        ],
        costStructure: [
          { component: 'น้ำยางดิบและขี้ยางหน้าสวน', componentEn: 'Raw Latex / Field Coagulum', sharePct: 63, unitAmount: 58.0, unit: 'บาท/กก.', description: 'ราคาปี 2565' },
          { component: 'แปรรูปโรงงานยางแท่ง/รมควัน', componentEn: 'Factory Processing & Chemicals', sharePct: 15, unitAmount: 13.8, unit: 'บาท/กก.', description: 'แปรรูป' },
          { component: 'ขนส่งภายในประเทศและลานตู้', componentEn: 'Inland Freight & Container Yard', sharePct: 10, unitAmount: 9.2, unit: 'บาท/กก.', description: 'ขนส่ง' },
          { component: 'เงินสงเคราะห์ CESS และพิธีการศุลกากร', componentEn: 'CESS Fund Tax & Customs', sharePct: 4, unitAmount: 3.68, unit: 'บาท/กก.', description: 'CESS' },
          { component: 'มาร์จิ้นผู้ส่งออกและการเงิน', componentEn: 'Margin & Finance', sharePct: 8, unitAmount: 7.36, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 1.04, valueMillionBaht: 48400, yoyGrowthPct: 7.2, seasonalFactor: 'ความต้องการยางยานยนต์ยังแข็งแกร่ง' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 1.02, valueMillionBaht: 47432, yoyGrowthPct: 6.1, seasonalFactor: 'สงครามรัสเซีย-ยูเครนเริ่มส่งผลต่อพลังงาน' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 1.03, valueMillionBaht: 47898, yoyGrowthPct: 4.8, seasonalFactor: 'อัตราเงินเฟ้อโลกกระทบความต้องการ' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 1.07, valueMillionBaht: 49870, yoyGrowthPct: 4.2, seasonalFactor: 'ส่งมอบปลายปี' },
        ],
        keyGateways: [
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 53, type: 'sea' },
          { name: 'ท่าเรือน้ำลึกสงขลา', sharePct: 25, type: 'sea' },
          { name: 'ด่านศุลกากรสะเดา', sharePct: 16, type: 'land' },
          { name: 'ด่านอื่นๆ', sharePct: 6, type: 'land' },
        ],
      },
    },
  },
  {
    id: 'cassava',
    name: 'มันสำปะหลัง',
    nameEn: 'Cassava Products',
    hsCode: '0714 / 1108.14',
    hsSubheadings: [
      '1108.14 - แป้งมันสำปะหลังดิบ (Native Starch) และแป้งดัดแปร (Modified Starch)',
      '0714.10 - มันสำปะหลังเส้น (Tapioca Chips) และมันสำปะหลังอัดเม็ด (Pellets)',
      '3505.10 - เดกซ์ทรินและมอดิไฟด์สตาร์ชสำหรับอุตสาหกรรมกระดาษและอาหาร',
    ],
    description: 'ผลิตภัณฑ์มันสำปะหลังครบวงจร ทั้งแป้งมันสำปะหลังคุณภาพสูง และมันเส้นเพื่ออุตสาหกรรมแอลกอฮอล์ชีวภาพและอาหารสัตว์',
    primaryUnit: 'ล้านตัน',
    years: {
      2024: {
        year: 2024,
        yearBe: 2567,
        exportVolumeMillionTons: 8.65,
        exportValueMillionBaht: 142800,
        importVolumeMillionTons: 0.85,
        importValueMillionBaht: 4850,
        tradeBalanceMillionBaht: 137950,
        yoyExportValueGrowthPct: 8.2,
        yoyExportVolumeGrowthPct: 3.1,
        fobAvgPriceUsdPerTon: 485,
        farmgateAvgPriceThbPerKg: 3.25,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 5.62, valueMillionBaht: 92820, sharePct: 65.0 },
          { rank: 2, country: 'อินโดนีเซีย', countryCode: 'ID', flag: '🇮🇩', volumeMillionTons: 0.78, valueMillionBaht: 12852, sharePct: 9.0 },
          { rank: 3, country: 'ญี่ปุ่น', countryCode: 'JP', flag: '🇯🇵', volumeMillionTons: 0.69, valueMillionBaht: 11424, sharePct: 8.0 },
          { rank: 4, country: 'ไต้หวัน', countryCode: 'TW', flag: '🇹🇼', volumeMillionTons: 0.43, valueMillionBaht: 7140, sharePct: 5.0 },
          { rank: 5, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.35, valueMillionBaht: 5712, sharePct: 4.0 },
        ],
        costStructure: [
          { component: 'หัวมันสดเชื้อแป้ง 25% หน้าลาน', componentEn: 'Fresh Cassava Roots (25% Starch)', sharePct: 62, unitAmount: 3.25, unit: 'บาท/กก.', description: 'ราคาหัวมันสดรับซื้อหน้าโรงงานแป้งและลานมัน' },
          { component: 'ค่าแปรรูปสกัดแป้งและสับตากลาน', componentEn: 'Starch Extraction / Chipping', sharePct: 16, unitAmount: 0.84, unit: 'บาท/กก.', description: 'ค่าน้ำ พลังงานไฟฟ้า เอนไซม์ และเครื่องจักรแปรรูป' },
          { component: 'โลจิสติกส์ขนส่งทางบกและเรือโป๊ะ', componentEn: 'Inland Trucking & Barge', sharePct: 11, unitAmount: 0.58, unit: 'บาท/กก.', description: 'ขนส่งจากโคราช/กำแพงเพชร สู่ท่าเรือเกาะสีชังและศรีราชา' },
          { component: 'ค่าภาระทุ่นลอยท่าเรือและตรวจสอบคุณภาพ', componentEn: 'Anchorage Port & Inspection', sharePct: 4, unitAmount: 0.21, unit: 'บาท/กก.', description: 'ค่าเทียบเรือโป๊ะ ขนถ่ายสินค้าเทกอง และตรวจความชื้น' },
          { component: 'มาร์จิ้นผู้ส่งออกและความเสี่ยงราคา', componentEn: 'Exporter Margin & Pricing Risk', sharePct: 7, unitAmount: 0.37, unit: 'บาท/กก.', description: 'กำไรส่วนต่างการค้าระหว่างประเทศและบริหารความผันผวน' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 2.76, valueMillionBaht: 45696, yoyGrowthPct: 11.2, seasonalFactor: 'ฤดูกาลขุดมันสำปะหลังพีคสูงสุด ลานมันตากมันเส้นเต็มกำลัง' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 2.25, valueMillionBaht: 37128, yoyGrowthPct: 8.4, seasonalFactor: 'ส่งมอบแป้งมันและมันเส้นต่อเนื่องก่อนเข้าฤดูฝนชุก' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 1.64, valueMillionBaht: 27132, yoyGrowthPct: 4.5, seasonalFactor: 'ฤดูฝน ลานมันหยุดตาก ผลผลิตหัวมันสดลดลง เน้นส่งมอบแป้งมัน' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 2.00, valueMillionBaht: 32844, yoyGrowthPct: 7.9, seasonalFactor: 'เริ่มเปิดฤดูกาลขุดหัวมันรอบใหม่ปลายปี' },
        ],
        keyGateways: [
          { name: 'ทุ่นลอยและท่าเทียบเรือเกาะสีชัง (ชลบุรี)', sharePct: 46, type: 'sea' },
          { name: 'ท่าเรือศรีราชาฮาร์เบอร์', sharePct: 28, type: 'sea' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 18, type: 'sea' },
          { name: 'ด่านศุลกากรช่องจอม/คลองลึก (นำเข้าหัวมันสด)', sharePct: 8, type: 'land' },
        ],
      },
      2023: {
        year: 2023,
        yearBe: 2566,
        exportVolumeMillionTons: 8.39,
        exportValueMillionBaht: 132000,
        importVolumeMillionTons: 0.81,
        importValueMillionBaht: 4400,
        tradeBalanceMillionBaht: 127600,
        yoyExportValueGrowthPct: -4.3,
        yoyExportVolumeGrowthPct: -6.8,
        fobAvgPriceUsdPerTon: 460,
        farmgateAvgPriceThbPerKg: 3.10,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 5.54, valueMillionBaht: 87120, sharePct: 66.0 },
          { rank: 2, country: 'อินโดนีเซีย', countryCode: 'ID', flag: '🇮🇩', volumeMillionTons: 0.75, valueMillionBaht: 11880, sharePct: 9.0 },
          { rank: 3, country: 'ญี่ปุ่น', countryCode: 'JP', flag: '🇯🇵', volumeMillionTons: 0.67, valueMillionBaht: 10560, sharePct: 8.0 },
          { rank: 4, country: 'ไต้หวัน', countryCode: 'TW', flag: '🇹🇼', volumeMillionTons: 0.42, valueMillionBaht: 6600, sharePct: 5.0 },
          { rank: 5, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.34, valueMillionBaht: 5280, sharePct: 4.0 },
        ],
        costStructure: [
          { component: 'หัวมันสดเชื้อแป้ง 25% หน้าลาน', componentEn: 'Fresh Cassava Roots (25% Starch)', sharePct: 61, unitAmount: 3.10, unit: 'บาท/กก.', description: 'ราคาปี 2566' },
          { component: 'ค่าแปรรูปสกัดแป้งและสับตากลาน', componentEn: 'Starch Extraction / Chipping', sharePct: 16, unitAmount: 0.81, unit: 'บาท/กก.', description: 'ค่าแปรรูป' },
          { component: 'โลจิสติกส์ขนส่งทางบกและเรือโป๊ะ', componentEn: 'Inland Trucking & Barge', sharePct: 12, unitAmount: 0.61, unit: 'บาท/กก.', description: 'ค่าขนส่ง' },
          { component: 'ค่าภาระทุ่นลอยท่าเรือและตรวจสอบคุณภาพ', componentEn: 'Anchorage Port & Inspection', sharePct: 4, unitAmount: 0.20, unit: 'บาท/กก.', description: 'ค่าธรรมเนียม' },
          { component: 'มาร์จิ้นผู้ส่งออกและความเสี่ยงราคา', componentEn: 'Margin & Pricing Risk', sharePct: 7, unitAmount: 0.36, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 2.68, valueMillionBaht: 42240, yoyGrowthPct: -2.1, seasonalFactor: 'โรคใบด่างมันสำปะหลังกระทบผลผลิตรวม' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 2.18, valueMillionBaht: 34320, yoyGrowthPct: -3.8, seasonalFactor: 'ปริมาณหัวมันเข้าโรงงานลดลงเล็กน้อย' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 1.59, valueMillionBaht: 25080, yoyGrowthPct: -6.2, seasonalFactor: 'ช่วงฤดูฝน' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 1.94, valueMillionBaht: 30360, yoyGrowthPct: -5.5, seasonalFactor: 'เริ่มฤดูกาลใหม่' },
        ],
        keyGateways: [
          { name: 'ทุ่นลอยและท่าเทียบเรือเกาะสีชัง (ชลบุรี)', sharePct: 47, type: 'sea' },
          { name: 'ท่าเรือศรีราชาฮาร์เบอร์', sharePct: 27, type: 'sea' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 18, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 8, type: 'land' },
        ],
      },
      2022: {
        year: 2022,
        yearBe: 2565,
        exportVolumeMillionTons: 9.00,
        exportValueMillionBaht: 137900,
        importVolumeMillionTons: 0.78,
        importValueMillionBaht: 3950,
        tradeBalanceMillionBaht: 133950,
        yoyExportValueGrowthPct: 15.2,
        yoyExportVolumeGrowthPct: 6.9,
        fobAvgPriceUsdPerTon: 440,
        farmgateAvgPriceThbPerKg: 2.85,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 6.03, valueMillionBaht: 92393, sharePct: 67.0 },
          { rank: 2, country: 'อินโดนีเซีย', countryCode: 'ID', flag: '🇮🇩', volumeMillionTons: 0.72, valueMillionBaht: 11032, sharePct: 8.0 },
          { rank: 3, country: 'ญี่ปุ่น', countryCode: 'JP', flag: '🇯🇵', volumeMillionTons: 0.63, valueMillionBaht: 9653, sharePct: 7.0 },
          { rank: 4, country: 'ไต้หวัน', countryCode: 'TW', flag: '🇹🇼', volumeMillionTons: 0.45, valueMillionBaht: 6895, sharePct: 5.0 },
          { rank: 5, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.36, valueMillionBaht: 5516, sharePct: 4.0 },
        ],
        costStructure: [
          { component: 'หัวมันสดเชื้อแป้ง 25% หน้าลาน', componentEn: 'Fresh Cassava Roots (25% Starch)', sharePct: 60, unitAmount: 2.85, unit: 'บาท/กก.', description: 'ราคาปี 2565' },
          { component: 'ค่าแปรรูปสกัดแป้งและสับตากลาน', componentEn: 'Starch Extraction / Chipping', sharePct: 16, unitAmount: 0.76, unit: 'บาท/กก.', description: 'ค่าแปรรูป' },
          { component: 'โลจิสติกส์ขนส่งทางบกและเรือโป๊ะ', componentEn: 'Inland Trucking & Barge', sharePct: 12, unitAmount: 0.57, unit: 'บาท/กก.', description: 'ค่าขนส่ง' },
          { component: 'ค่าภาระทุ่นลอยท่าเรือและตรวจสอบคุณภาพ', componentEn: 'Anchorage Port & Inspection', sharePct: 4, unitAmount: 0.19, unit: 'บาท/กก.', description: 'ค่าธรรมเนียม' },
          { component: 'มาร์จิ้นผู้ส่งออกและความเสี่ยงราคา', componentEn: 'Margin & Pricing Risk', sharePct: 8, unitAmount: 0.38, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 2.88, valueMillionBaht: 44128, yoyGrowthPct: 16.5, seasonalFactor: 'ราคาข้าวโพดโลกพุ่งสูง จีนหันมาซื้อมันเส้นทดแทน' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 2.34, valueMillionBaht: 35854, yoyGrowthPct: 15.8, seasonalFactor: 'การส่งออกขยายตัวสูงต่อเนื่อง' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 1.71, valueMillionBaht: 26201, yoyGrowthPct: 13.9, seasonalFactor: 'ช่วงฤดูฝน' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 2.07, valueMillionBaht: 31717, yoyGrowthPct: 14.2, seasonalFactor: 'ปลายปีเริ่มรอบเก็บเกี่ยวใหม่' },
        ],
        keyGateways: [
          { name: 'ทุ่นลอยและท่าเทียบเรือเกาะสีชัง (ชลบุรี)', sharePct: 48, type: 'sea' },
          { name: 'ท่าเรือศรีราชาฮาร์เบอร์', sharePct: 26, type: 'sea' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 18, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 8, type: 'land' },
        ],
      },
    },
  },
  {
    id: 'palm',
    name: 'ปาล์มน้ำมัน',
    nameEn: 'Oil Palm Products',
    hsCode: '1511',
    hsSubheadings: [
      '1511.10 - น้ำมันปาล์มดิบ (Crude Palm Oil - CPO)',
      '1511.90 - น้ำมันปาล์มบริสุทธิ์ (RBD Palm Oil) และปาล์มสเตียรีน (Palm Stearin)',
      '1513.21/29 - น้ำมันเมล็ดในปาล์มดิบและบริสุทธิ์ (Palm Kernel Oil)',
    ],
    description: 'น้ำมันปาล์มดิบ CPO และผลิตภัณฑ์ปาล์มแปรรูปเพื่อพลังงานไบโอดีเซล B7/B10 และอุตสาหกรรมโอเลโอเคมีคอล',
    primaryUnit: 'ล้านตัน',
    years: {
      2024: {
        year: 2024,
        yearBe: 2567,
        exportVolumeMillionTons: 1.15,
        exportValueMillionBaht: 38500,
        importVolumeMillionTons: 0.082,
        importValueMillionBaht: 2980,
        tradeBalanceMillionBaht: 35520,
        yoyExportValueGrowthPct: 11.6,
        yoyExportVolumeGrowthPct: 16.2,
        fobAvgPriceUsdPerTon: 940,
        farmgateAvgPriceThbPerKg: 5.65,
        topDestinations: [
          { rank: 1, country: 'อินเดีย', countryCode: 'IN', flag: '🇮🇳', volumeMillionTons: 0.82, valueMillionBaht: 27720, sharePct: 72.0 },
          { rank: 2, country: 'เมียนมา', countryCode: 'MM', flag: '🇲🇲', volumeMillionTons: 0.13, valueMillionBaht: 4235, sharePct: 11.0 },
          { rank: 3, country: 'เวียดนาม', countryCode: 'VN', flag: '🇻🇳', volumeMillionTons: 0.07, valueMillionBaht: 2310, sharePct: 6.0 },
          { rank: 4, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.05, valueMillionBaht: 1540, sharePct: 4.0 },
          { rank: 5, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.03, valueMillionBaht: 1155, sharePct: 3.0 },
        ],
        costStructure: [
          { component: 'ผลปาล์มสดทะลาย FFB หน้าลานเท', componentEn: 'Fresh Fruit Bunches (FFB)', sharePct: 68, unitAmount: 5.65, unit: 'บาท/กก.', description: 'ราคาผลปาล์มสดอัตราน้ำมัน 18% รับซื้อจากเกษตรกรภาคใต้' },
          { component: 'ค่าหีบสกัดน้ำมันปาล์มดิบ CPO', componentEn: 'Crude Palm Oil Extraction', sharePct: 13, unitAmount: 1.08, unit: 'บาท/กก.', description: 'ค่าอบนึ่ง แยกผล ปั่นสกัด และบำบัดน้ำเสียไบโอแก๊ส' },
          { component: 'คลังเก็บแท็งก์ฟาร์มและท่อขนถ่าย', componentEn: 'Shore Tank Storage & Pipeline', sharePct: 8, unitAmount: 0.66, unit: 'บาท/กก.', description: 'ค่าจัดเก็บในแท็งก์อุณหภูมิควบคุมและท่อโหลดเรือบรรทุกของเหลว' },
          { component: 'โลจิสติกส์ท่าเรือและการขนส่งทางทะเล', componentEn: 'Port Logistics & Marine Survey', sharePct: 5, unitAmount: 0.42, unit: 'บาท/กก.', description: 'ค่าภาระท่าเรือสุราษฎร์ธานี/กระบี่ และตรวจสอบปริมาณกรดไขมันอิสระ (FFA)' },
          { component: 'มาร์จิ้นผู้ส่งออกและการประกันความเสี่ยง', componentEn: 'Exporter Margin & Hedging', sharePct: 6, unitAmount: 0.50, unit: 'บาท/กก.', description: 'ส่วนต่างราคาเทียบตลาดมาเลเซีย (MDEX) และประกันภัย' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.22, valueMillionBaht: 7315, yoyGrowthPct: 7.5, seasonalFactor: 'ช่วงผลผลิตต่ำสุด (Low Season) ปาล์มเพิ่งเริ่มแทงช่อดอก' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.38, valueMillionBaht: 12705, yoyGrowthPct: 15.2, seasonalFactor: 'ผลปาล์มสุกทะลักเข้าโรงสกัด (Peak Harvest) รัฐเร่งผลักดันส่งออก CPO' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 0.32, valueMillionBaht: 10780, yoyGrowthPct: 12.0, seasonalFactor: 'อินเดียสั่งซื้อสต็อกเตรียมเทศกาลดิวาลี (Diwali)' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 0.23, valueMillionBaht: 7700, yoyGrowthPct: 9.8, seasonalFactor: 'มรสุมภาคใต้ ปริมาณผลผลิตเริ่มทรงตัว' },
        ],
        keyGateways: [
          { name: 'ท่าเรือสุราษฎร์ธานี (บ้านดอน)', sharePct: 44, type: 'sea' },
          { name: 'ท่าเรือน้ำลึกกระบี่/กันตัง (ตรัง)', sharePct: 28, type: 'sea' },
          { name: 'ท่าเรือแหลมฉบัง (ชลบุรี)', sharePct: 16, type: 'sea' },
          { name: 'ด่านศุลกากรระนอง (สู่เกาะสอง เมียนมา)', sharePct: 12, type: 'sea' },
        ],
      },
      2023: {
        year: 2023,
        yearBe: 2566,
        exportVolumeMillionTons: 0.99,
        exportValueMillionBaht: 34500,
        importVolumeMillionTons: 0.075,
        importValueMillionBaht: 2850,
        tradeBalanceMillionBaht: 31650,
        yoyExportValueGrowthPct: -22.5,
        yoyExportVolumeGrowthPct: -5.7,
        fobAvgPriceUsdPerTon: 980,
        farmgateAvgPriceThbPerKg: 5.10,
        topDestinations: [
          { rank: 1, country: 'อินเดีย', countryCode: 'IN', flag: '🇮🇳', volumeMillionTons: 0.70, valueMillionBaht: 24495, sharePct: 71.0 },
          { rank: 2, country: 'เมียนมา', countryCode: 'MM', flag: '🇲🇲', volumeMillionTons: 0.12, valueMillionBaht: 4140, sharePct: 12.0 },
          { rank: 3, country: 'เวียดนาม', countryCode: 'VN', flag: '🇻🇳', volumeMillionTons: 0.06, valueMillionBaht: 2070, sharePct: 6.0 },
          { rank: 4, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.04, valueMillionBaht: 1380, sharePct: 4.0 },
          { rank: 5, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.03, valueMillionBaht: 1035, sharePct: 3.0 },
        ],
        costStructure: [
          { component: 'ผลปาล์มสดทะลาย FFB หน้าลานเท', componentEn: 'Fresh Fruit Bunches (FFB)', sharePct: 67, unitAmount: 5.10, unit: 'บาท/กก.', description: 'ราคาเฉลี่ยปี 2566' },
          { component: 'ค่าหีบสกัดน้ำมันปาล์มดิบ CPO', componentEn: 'Crude Palm Oil Extraction', sharePct: 14, unitAmount: 1.07, unit: 'บาท/กก.', description: 'ค่าหีบ' },
          { component: 'คลังเก็บแท็งก์ฟาร์มและท่อขนถ่าย', componentEn: 'Shore Tank Storage & Pipeline', sharePct: 8, unitAmount: 0.61, unit: 'บาท/กก.', description: 'แท็งก์ฟาร์ม' },
          { component: 'โลจิสติกส์ท่าเรือและการขนส่งทางทะเล', componentEn: 'Port Logistics & Marine Survey', sharePct: 5, unitAmount: 0.38, unit: 'บาท/กก.', description: 'โลจิสติกส์' },
          { component: 'มาร์จิ้นผู้ส่งออกและการประกันความเสี่ยง', componentEn: 'Exporter Margin & Hedging', sharePct: 6, unitAmount: 0.46, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.19, valueMillionBaht: 6555, yoyGrowthPct: -25.0, seasonalFactor: 'ราคาน้ำมันพืชโลกปรับฐานลงจากจุดสูงสุดปี 2565' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.33, valueMillionBaht: 11385, yoyGrowthPct: -21.4, seasonalFactor: 'อินโดนีเซียยกเลิกแบนส่งออก ทำให้ซัพพลายโลกเพิ่ม' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 0.28, valueMillionBaht: 9660, yoyGrowthPct: -20.8, seasonalFactor: 'การแข่งขันราคากับมาเลเซียและอินโดนีเซีย' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 0.19, valueMillionBaht: 6900, yoyGrowthPct: -21.2, seasonalFactor: 'สต็อกในประเทศเริ่มสมดุล' },
        ],
        keyGateways: [
          { name: 'ท่าเรือสุราษฎร์ธานี (บ้านดอน)', sharePct: 45, type: 'sea' },
          { name: 'ท่าเรือน้ำลึกกระบี่/กันตัง', sharePct: 27, type: 'sea' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 17, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 11, type: 'sea' },
        ],
      },
      2022: {
        year: 2022,
        yearBe: 2565,
        exportVolumeMillionTons: 1.05,
        exportValueMillionBaht: 44500,
        importVolumeMillionTons: 0.070,
        importValueMillionBaht: 2600,
        tradeBalanceMillionBaht: 41900,
        yoyExportValueGrowthPct: 58.4,
        yoyExportVolumeGrowthPct: 38.2,
        fobAvgPriceUsdPerTon: 1220,
        farmgateAvgPriceThbPerKg: 7.80,
        topDestinations: [
          { rank: 1, country: 'อินเดีย', countryCode: 'IN', flag: '🇮🇳', volumeMillionTons: 0.77, valueMillionBaht: 32485, sharePct: 73.0 },
          { rank: 2, country: 'เมียนมา', countryCode: 'MM', flag: '🇲🇲', volumeMillionTons: 0.12, valueMillionBaht: 4895, sharePct: 11.0 },
          { rank: 3, country: 'เวียดนาม', countryCode: 'VN', flag: '🇻🇳', volumeMillionTons: 0.06, valueMillionBaht: 2670, sharePct: 6.0 },
          { rank: 4, country: 'มาเลเซีย', countryCode: 'MY', flag: '🇲🇾', volumeMillionTons: 0.04, valueMillionBaht: 1780, sharePct: 4.0 },
          { rank: 5, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.03, valueMillionBaht: 1335, sharePct: 3.0 },
        ],
        costStructure: [
          { component: 'ผลปาล์มสดทะลาย FFB หน้าลานเท', componentEn: 'Fresh Fruit Bunches (FFB)', sharePct: 70, unitAmount: 7.80, unit: 'บาท/กก.', description: 'ราคาสูงสุดเป็นประวัติการณ์' },
          { component: 'ค่าหีบสกัดน้ำมันปาล์มดิบ CPO', componentEn: 'Crude Palm Oil Extraction', sharePct: 13, unitAmount: 1.45, unit: 'บาท/กก.', description: 'หีบสกัด' },
          { component: 'คลังเก็บแท็งก์ฟาร์มและท่อขนถ่าย', componentEn: 'Shore Tank Storage & Pipeline', sharePct: 7, unitAmount: 0.78, unit: 'บาท/กก.', description: 'แท็งก์' },
          { component: 'โลจิสติกส์ท่าเรือและการขนส่งทางทะเล', componentEn: 'Port Logistics & Marine Survey', sharePct: 4, unitAmount: 0.45, unit: 'บาท/กก.', description: 'ท่าเรือ' },
          { component: 'มาร์จิ้นผู้ส่งออกและการประกันความเสี่ยง', componentEn: 'Exporter Margin & Hedging', sharePct: 6, unitAmount: 0.67, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.23, valueMillionBaht: 9790, yoyGrowthPct: 45.0, seasonalFactor: 'สงครามรัสเซียส่งผลกระทบน้ำมันทานตะวัน' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.40, valueMillionBaht: 16910, yoyGrowthPct: 72.5, seasonalFactor: 'อินโดนีเซียสั่งห้ามส่งออก CPO ดันราคาโลกพุ่งกระฉูด' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 0.25, valueMillionBaht: 10680, yoyGrowthPct: 56.0, seasonalFactor: 'อินเดียหันมานำเข้าน้ำมันปาล์มจากไทยสูงสุด' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 0.17, valueMillionBaht: 7120, yoyGrowthPct: 48.0, seasonalFactor: 'ปลายปีราคาเริ่มผ่อนคลาย' },
        ],
        keyGateways: [
          { name: 'ท่าเรือสุราษฎร์ธานี (บ้านดอน)', sharePct: 46, type: 'sea' },
          { name: 'ท่าเรือน้ำลึกกระบี่/กันตัง', sharePct: 26, type: 'sea' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 18, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 10, type: 'sea' },
        ],
      },
    },
  },
  {
    id: 'durian',
    name: 'ทุเรียน',
    nameEn: 'Durian',
    hsCode: '0810.60 / 0811.90',
    hsSubheadings: [
      '0810.60 - ทุเรียนสด (Fresh Durian) เกรด AB และเกรดรวม',
      '0811.90 - ทุเรียนแช่เยือกแข็ง (Frozen Durian เนื้อทุเรียนแกะและทั้งลูกแช่แข็ง)',
      '0812.90 - ทุเรียนกวนและผลไม้อบแห้งแปรรูป',
    ],
    description: 'ราชาแห่งผลไม้ สินค้าเกษตรดาวรุ่งส่งออกอันดับ 1 ในหมวดผลไม้สด นำโดยพันธุ์หมอนทอง ชะนี และก้านยาว',
    primaryUnit: 'ล้านตัน',
    isRisingStar: true,
    years: {
      2024: {
        year: 2024,
        yearBe: 2567,
        exportVolumeMillionTons: 1.08,
        exportValueMillionBaht: 167200,
        importVolumeMillionTons: 0.002,
        importValueMillionBaht: 110,
        tradeBalanceMillionBaht: 167090,
        yoyExportValueGrowthPct: 18.4,
        yoyExportVolumeGrowthPct: 11.3,
        fobAvgPriceUsdPerTon: 4450,
        farmgateAvgPriceThbPerKg: 135.0,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.99, valueMillionBaht: 153824, sharePct: 92.0 },
          { rank: 2, country: 'ฮ่องกง', countryCode: 'HK', flag: '🇭🇰', volumeMillionTons: 0.043, valueMillionBaht: 6688, sharePct: 4.0 },
          { rank: 3, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.016, valueMillionBaht: 2508, sharePct: 1.5 },
          { rank: 4, country: 'เวียดนาม', countryCode: 'VN', flag: '🇻🇳', volumeMillionTons: 0.013, valueMillionBaht: 2006, sharePct: 1.2 },
          { rank: 5, country: 'เกาหลีใต้', countryCode: 'KR', flag: '🇰🇷', volumeMillionTons: 0.005, valueMillionBaht: 836, sharePct: 0.5 },
        ],
        costStructure: [
          { component: 'ผลผลิตทุเรียนคัดเกรดเหมาสวน', componentEn: 'Farm-gate Fruit (Export Grade AB)', sharePct: 65, unitAmount: 135.0, unit: 'บาท/กก.', description: 'ราคาเหมาสวนทุเรียนหมอนทองเปอร์เซ็นต์แป้งขั้นต่ำ 32%' },
          { component: 'คัดแยก ล้ง ชุบสาร และบรรจุกล่อง', componentEn: 'Packing House Sorting & Box Packing', sharePct: 13, unitAmount: 27.0, unit: 'บาท/กก.', description: 'ค่าแรงตัดคัดเกรด จุ่มสารป้องกันเชื้อรา บรรจุกล่องลูกฟูก 18 กก.' },
          { component: 'ตู้คอนเทนเนอร์เย็น Reefer ขนส่งข้ามแดน', componentEn: 'Cold-chain Reefer Freight & Rail', sharePct: 12, unitAmount: 24.9, unit: 'บาท/กก.', description: 'ค่ารถตู้เย็นข้ามแดนลาว/เวียดนาม และรถไฟไทย-จีน' },
          { component: 'การตรวจรับรองศุลกากร DOA สุขอนามัยพืช', componentEn: 'DOA Phytosanitary & Quarantine', sharePct: 3, unitAmount: 6.2, unit: 'บาท/กก.', description: 'ตรวจสารเคมีตกค้างและแมลงศัตรูพืชตามพิธีสารส่งออกทุเรียนไทย-จีน' },
          { component: 'มาร์จิ้นผู้ประกอบการล้งและส่งออก', componentEn: 'Lhong & Exporter Trading Margin', sharePct: 7, unitAmount: 14.5, unit: 'บาท/กก.', description: 'กำไรผู้ค้าล้งและผู้ส่งออก พร้อมประกันความเสียหายจากการสุกงอม' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.12, valueMillionBaht: 18392, yoyGrowthPct: 14.2, seasonalFactor: 'ทุเรียนทวายและผลผลิตรอบต้นฤดูเริ่มเก็บเกี่ยว' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.62, valueMillionBaht: 96976, yoyGrowthPct: 20.8, seasonalFactor: 'พีคฤดูกาลทุเรียนภาคตะวันออก (จันทบุรี ระยอง ตราด) ล้งเปิด 24 ชม.' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 0.28, valueMillionBaht: 43472, yoyGrowthPct: 16.5, seasonalFactor: 'ฤดูกาลทุเรียนภาคใต้ (ชุมพร สุราษฎร์ฯ ยะลา) ส่งมอบต่อเนื่อง' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 0.06, valueMillionBaht: 8360, yoyGrowthPct: 12.0, seasonalFactor: 'ปลายฤดู เน้นทุเรียนแช่แข็งและทุเรียนนอกฤดู' },
        ],
        keyGateways: [
          { name: 'ด่านศุลกากรเชียงของ (ถนน R3A เข้าบ่อหาน จีน)', sharePct: 38, type: 'land' },
          { name: 'ด่านศุลกากรนครพนม / มุกดาหาร (ผ่านเวียดนาม)', sharePct: 29, type: 'land' },
          { name: 'ด่านศุลกากรหนองคาย (รถไฟไทย-ลาว-จีน)', sharePct: 18, type: 'land' },
          { name: 'ท่าเรือแหลมฉบัง (ตู้ Reefer ทางเรือ)', sharePct: 15, type: 'sea' },
        ],
      },
      2023: {
        year: 2023,
        yearBe: 2566,
        exportVolumeMillionTons: 0.97,
        exportValueMillionBaht: 141200,
        importVolumeMillionTons: 0.002,
        importValueMillionBaht: 95,
        tradeBalanceMillionBaht: 141105,
        yoyExportValueGrowthPct: 27.5,
        yoyExportVolumeGrowthPct: 18.3,
        fobAvgPriceUsdPerTon: 4180,
        farmgateAvgPriceThbPerKg: 122.0,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.89, valueMillionBaht: 129904, sharePct: 92.0 },
          { rank: 2, country: 'ฮ่องกง', countryCode: 'HK', flag: '🇭🇰', volumeMillionTons: 0.039, valueMillionBaht: 5648, sharePct: 4.0 },
          { rank: 3, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.015, valueMillionBaht: 2118, sharePct: 1.5 },
          { rank: 4, country: 'เวียดนาม', countryCode: 'VN', flag: '🇻🇳', volumeMillionTons: 0.012, valueMillionBaht: 1694, sharePct: 1.2 },
          { rank: 5, country: 'เกาหลีใต้', countryCode: 'KR', flag: '🇰🇷', volumeMillionTons: 0.005, valueMillionBaht: 706, sharePct: 0.5 },
        ],
        costStructure: [
          { component: 'ผลผลิตทุเรียนคัดเกรดเหมาสวน', componentEn: 'Farm-gate Fruit (Export Grade AB)', sharePct: 64, unitAmount: 122.0, unit: 'บาท/กก.', description: 'ราคาปี 2566' },
          { component: 'คัดแยก ล้ง ชุบสาร และบรรจุกล่อง', componentEn: 'Packing House Sorting & Box Packing', sharePct: 13, unitAmount: 24.8, unit: 'บาท/กก.', description: 'ค่าล้ง' },
          { component: 'ตู้คอนเทนเนอร์เย็น Reefer ขนส่งข้ามแดน', componentEn: 'Cold-chain Reefer Freight & Rail', sharePct: 13, unitAmount: 24.8, unit: 'บาท/กก.', description: 'ค่าขนส่งเย็น' },
          { component: 'การตรวจรับรองศุลกากร DOA สุขอนามัยพืช', componentEn: 'DOA Phytosanitary & Quarantine', sharePct: 3, unitAmount: 5.7, unit: 'บาท/กก.', description: 'ใบรับรอง DOA' },
          { component: 'มาร์จิ้นผู้ประกอบการล้งและส่งออก', componentEn: 'Lhong & Exporter Trading Margin', sharePct: 7, unitAmount: 13.3, unit: 'บาท/กก.', description: 'กำไรล้ง' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.10, valueMillionBaht: 14826, yoyGrowthPct: 22.0, seasonalFactor: 'เริ่มเปิดตลาดจีนหลังเปิดประเทศเต็มรูปแบบ' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.57, valueMillionBaht: 83308, yoyGrowthPct: 31.4, seasonalFactor: 'ฤดูผลไม้ภาคตะวันออกเติบโตสูงสุด' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 0.25, valueMillionBaht: 36712, yoyGrowthPct: 24.8, seasonalFactor: 'ผลผลิตภาคใต้เข้ามาเสริม' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 0.05, valueMillionBaht: 6354, yoyGrowthPct: 15.2, seasonalFactor: 'ส่งท้ายปี' },
        ],
        keyGateways: [
          { name: 'ด่านศุลกากรเชียงของ', sharePct: 40, type: 'land' },
          { name: 'ด่านศุลกากรนครพนม / มุกดาหาร', sharePct: 30, type: 'land' },
          { name: 'ด่านศุลกากรหนองคาย (รถไฟ)', sharePct: 15, type: 'land' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 15, type: 'sea' },
        ],
      },
      2022: {
        year: 2022,
        yearBe: 2565,
        exportVolumeMillionTons: 0.82,
        exportValueMillionBaht: 110700,
        importVolumeMillionTons: 0.001,
        importValueMillionBaht: 75,
        tradeBalanceMillionBaht: 110625,
        yoyExportValueGrowthPct: 9.8,
        yoyExportVolumeGrowthPct: 4.2,
        fobAvgPriceUsdPerTon: 3880,
        farmgateAvgPriceThbPerKg: 105.0,
        topDestinations: [
          { rank: 1, country: 'จีน', countryCode: 'CN', flag: '🇨🇳', volumeMillionTons: 0.75, valueMillionBaht: 101844, sharePct: 92.0 },
          { rank: 2, country: 'ฮ่องกง', countryCode: 'HK', flag: '🇭🇰', volumeMillionTons: 0.033, valueMillionBaht: 4428, sharePct: 4.0 },
          { rank: 3, country: 'สหรัฐอเมริกา', countryCode: 'US', flag: '🇺🇸', volumeMillionTons: 0.012, valueMillionBaht: 1660, sharePct: 1.5 },
          { rank: 4, country: 'เวียดนาม', countryCode: 'VN', flag: '🇻🇳', volumeMillionTons: 0.010, valueMillionBaht: 1328, sharePct: 1.2 },
          { rank: 5, country: 'เกาหลีใต้', countryCode: 'KR', flag: '🇰🇷', volumeMillionTons: 0.004, valueMillionBaht: 554, sharePct: 0.5 },
        ],
        costStructure: [
          { component: 'ผลผลิตทุเรียนคัดเกรดเหมาสวน', componentEn: 'Farm-gate Fruit (Export Grade AB)', sharePct: 63, unitAmount: 105.0, unit: 'บาท/กก.', description: 'ราคาปี 2565' },
          { component: 'คัดแยก ล้ง ชุบสาร และบรรจุกล่อง', componentEn: 'Packing House Sorting & Box Packing', sharePct: 14, unitAmount: 23.3, unit: 'บาท/กก.', description: 'ล้ง' },
          { component: 'ตู้คอนเทนเนอร์เย็น Reefer ขนส่งข้ามแดน', componentEn: 'Cold-chain Reefer Freight & Rail', sharePct: 13, unitAmount: 21.7, unit: 'บาท/กก.', description: 'ขนส่งเย็น' },
          { component: 'การตรวจรับรองศุลกากร DOA สุขอนามัยพืช', componentEn: 'DOA Phytosanitary & Quarantine', sharePct: 3, unitAmount: 5.0, unit: 'บาท/กก.', description: 'ตรวจศัตรูพืช' },
          { component: 'มาร์จิ้นผู้ประกอบการล้งและส่งออก', componentEn: 'Lhong & Exporter Trading Margin', sharePct: 7, unitAmount: 11.7, unit: 'บาท/กก.', description: 'มาร์จิ้น' },
        ],
        quarterlyTrends: [
          { quarter: 'Q1', label: 'ไตรมาส 1', months: 'ม.ค. - มี.ค.', volumeMillionTons: 0.09, valueMillionBaht: 12177, yoyGrowthPct: 8.5, seasonalFactor: 'มาตรการ Zero-COVID ด่านจีนเข้มงวดมาก' },
          { quarter: 'Q2', label: 'ไตรมาส 2', months: 'เม.ย. - มิ.ย.', volumeMillionTons: 0.48, valueMillionBaht: 65313, yoyGrowthPct: 10.5, seasonalFactor: 'รถติดหน้าด่านโม่ฮาน ต้องกระจายไปทางเรือและรถไฟ' },
          { quarter: 'Q3', label: 'ไตรมาส 3', months: 'ก.ค. - ก.ย.', volumeMillionTons: 0.21, valueMillionBaht: 28229, yoyGrowthPct: 9.2, seasonalFactor: 'ทุเรียนใต้ทยอยส่งออก' },
          { quarter: 'Q4', label: 'ไตรมาส 4', months: 'ต.ค. - ธ.ค.', volumeMillionTons: 0.04, valueMillionBaht: 4981, yoyGrowthPct: 7.8, seasonalFactor: 'ส่งท้ายปี' },
        ],
        keyGateways: [
          { name: 'ด่านศุลกากรเชียงของ', sharePct: 42, type: 'land' },
          { name: 'ด่านศุลกากรนครพนม / มุกดาหาร', sharePct: 32, type: 'land' },
          { name: 'ท่าเรือแหลมฉบัง', sharePct: 16, type: 'sea' },
          { name: 'ด่านอื่นๆ', sharePct: 10, type: 'land' },
        ],
      },
    },
  },
];

export const AVAILABLE_YEARS = [2024, 2023, 2022];

export function getCommodityProfile(id: string): CommodityTradeProfile | undefined {
  return COMMODITY_TRADE_PROFILES.find(p => p.id === id);
}

export function buildTradeDashboard(options?: {
  year?: number;
  commodityId?: string;
}): TradeDashboardPayload {
  const selectedYear = options?.year && AVAILABLE_YEARS.includes(options.year) ? options.year : 2024;
  const rawCommodity = (options?.commodityId || 'all').toLowerCase().trim();
  const normalizedCommodity = rawCommodity === 'oil-palm' ? 'palm' : rawCommodity;
  const selectedCommodity = COMMODITY_TRADE_PROFILES.some(p => p.id === normalizedCommodity) ? normalizedCommodity : 'all';

  let totalExportValue = 0;
  let totalExportVolume = 0;
  let totalImportValue = 0;
  let totalPrevExportValue = 0;
  let impliedPrevExportValue = 0;
  let growthRateCount = 0;

  const prevYear = selectedYear - 1;
  const hasPrevYear = AVAILABLE_YEARS.includes(prevYear);

  // Compute aggregated totals
  for (const profile of COMMODITY_TRADE_PROFILES) {
    const data = profile.years[selectedYear];
    if (data) {
      totalExportValue += data.exportValueMillionBaht;
      totalExportVolume += data.exportVolumeMillionTons;
      totalImportValue += data.importValueMillionBaht;
      // อัตราเติบโตที่ประกาศคู่แถวปีนั้นใช้ได้แม้ไม่มีแถวปีก่อนหน้าในชุดข้อมูล (เช่นปี 2022)
      impliedPrevExportValue += data.exportValueMillionBaht / (1 + data.yoyExportValueGrowthPct / 100);
      growthRateCount += 1;
    }
    if (hasPrevYear) {
      const prevData = profile.years[prevYear];
      if (prevData) {
        totalPrevExportValue += prevData.exportValueMillionBaht;
      }
    }
  }

  const prevBaseAvailable = hasPrevYear && totalPrevExportValue > 0;
  const yoyBase = prevBaseAvailable ? totalPrevExportValue : impliedPrevExportValue;
  const yoyAvailable = growthRateCount > 0 && yoyBase > 0;
  const yoyExportGrowthPct = yoyAvailable
    ? Number((((totalExportValue - yoyBase) / yoyBase) * 100).toFixed(1))
    : 0;

  const tradeBalanceMillionBaht = totalExportValue - totalImportValue;

  // Find rising star for the year
  const risingStarProfile = COMMODITY_TRADE_PROFILES.find(p => p.isRisingStar)!;
  const risingStarYearData = risingStarProfile.years[selectedYear];

  // Destination Aggregates across all commodities
  const countryMap = new Map<string, { country: string; countryCode: string; flag: string; volume: number; value: number }>();
  let coveredDestinationValue = 0;

  for (const profile of COMMODITY_TRADE_PROFILES) {
    const data = profile.years[selectedYear];
    if (data) {
      // ใช้ countryCode เป็นกุญแจ เพื่อไม่ให้ชื่อประเทศที่เขียนต่างกันถูกนับเป็นคนละตลาด
      for (const dest of data.topDestinations) {
        coveredDestinationValue += dest.valueMillionBaht;
        const key = dest.countryCode || dest.country;
        const existing = countryMap.get(key);
        if (existing) {
          existing.volume += dest.volumeMillionTons;
          existing.value += dest.valueMillionBaht;
        } else {
          countryMap.set(key, {
            country: dest.country,
            countryCode: dest.countryCode,
            flag: dest.flag,
            volume: dest.volumeMillionTons,
            value: dest.valueMillionBaht,
          });
        }
      }
    }
  }

  const sortedCountries = Array.from(countryMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topDestinationsOverall: TradeDestination[] = sortedCountries.map((c, i) => ({
    rank: i + 1,
    country: c.country,
    countryCode: c.countryCode,
    flag: c.flag,
    volumeMillionTons: Number(c.volume.toFixed(2)),
    valueMillionBaht: Math.round(c.value),
    sharePct: Number(((c.value / totalExportValue) * 100).toFixed(1)),
  }));

  const destinationCoverage: DestinationCoverage = {
    basis: 'top5_per_commodity',
    coveredExportValueMillionBaht: Math.round(coveredDestinationValue),
    totalExportValueMillionBaht: totalExportValue,
    coveragePct: totalExportValue > 0
      ? Number(((coveredDestinationValue / totalExportValue) * 100).toFixed(1))
      : 0,
    note: 'ยอดคู่ค้าที่มีรายละเอียดครอบคลุมเฉพาะ 5 อันดับแรกของแต่ละสินค้า; สัดส่วนตลาดคำนวณจากมูลค่าส่งออกรวมทั้งชุด ส่วนที่เหลือกระจายในตลาดอื่นที่ยังไม่มีรายละเอียด',
  };

  const tradeBalances: TradeBalanceItem[] = COMMODITY_TRADE_PROFILES.map(profile => {
    const data = profile.years[selectedYear];
    const expVal = data?.exportValueMillionBaht || 0;
    const impVal = data?.importValueMillionBaht || 0;
    const balance = expVal - impVal;
    return {
      commodityId: profile.id,
      name: profile.name,
      hsCode: profile.hsCode,
      exportValue: expVal,
      importValue: impVal,
      tradeBalance: balance,
      balanceStatus: balance >= 0 ? 'surplus' : 'deficit',
      exportVolume: data?.exportVolumeMillionTons || 0,
    };
  });

  const commodityDetail = selectedCommodity !== 'all'
    ? COMMODITY_TRADE_PROFILES.find(p => p.id === selectedCommodity)
    : undefined;

  const activeYearData = commodityDetail?.years[selectedYear];

  const effectiveExportValue = activeYearData ? activeYearData.exportValueMillionBaht : totalExportValue;
  const effectiveExportVolume = activeYearData ? activeYearData.exportVolumeMillionTons : Number(totalExportVolume.toFixed(2));
  const effectiveImportValue = activeYearData ? activeYearData.importValueMillionBaht : totalImportValue;
  // คำนวณดุลจากยอดส่งออก-นำเข้าของปี/สินค้าที่เลือกโดยตรง ไม่ใช้ค่าที่เก็บซ้ำ
  const effectiveTradeBalance = effectiveExportValue - effectiveImportValue;
  const effectiveYoyGrowth = activeYearData ? activeYearData.yoyExportValueGrowthPct : yoyExportGrowthPct;
  const effectiveYoyAvailable = activeYearData ? true : yoyAvailable;

  const topPartner = activeYearData?.topDestinations[0]
    ?? topDestinationsOverall[0]
    ?? COMMODITY_TRADE_PROFILES[0]?.years[selectedYear]?.topDestinations[0];

  const kpi: TradeKpiSummary = {
    year: selectedYear,
    yearBe: selectedYear + 543,
    totalExportValueMillionBaht: effectiveExportValue,
    totalExportVolumeMillionTons: effectiveExportVolume,
    totalImportValueMillionBaht: effectiveImportValue,
    tradeBalanceMillionBaht: effectiveTradeBalance,
    yoyExportGrowthPct: effectiveYoyGrowth,
    yoyAvailable: effectiveYoyAvailable,
    risingStar: {
      id: risingStarProfile.id,
      name: risingStarProfile.name,
      hsCode: risingStarProfile.hsCode,
      yoyGrowthPct: risingStarYearData?.yoyExportValueGrowthPct ?? 0,
      exportValueMillionBaht: risingStarYearData?.exportValueMillionBaht ?? 0,
      highlightNote: 'ทุเรียนสดและแช่แข็ง ขยายตัวสูงในตลาดจีนต่อเนื่อง เติบโตทั้งปริมาณและราคา',
    },
    topPartner: {
      country: topPartner?.country ?? 'ไม่ระบุ',
      flag: topPartner?.flag ?? '',
      totalValueMillionBaht: topPartner?.valueMillionBaht ?? 0,
      sharePct: topPartner?.sharePct ?? 0,
    },
  };

  return {
    sample: true,
    selectedYear,
    selectedCommodity,
    availableYears: AVAILABLE_YEARS,
    availableCommodities: COMMODITY_TRADE_PROFILES.map(p => ({
      id: p.id,
      name: p.name,
      hsCode: p.hsCode,
    })),
    kpi,
    tradeBalances,
    topDestinationsOverall,
    destinationCoverage,
    commodityDetail,
    allCommodities: COMMODITY_TRADE_PROFILES,
    meta: {
      access: 'metadata_only',
      availability: 'ready',
      sourceIds: ['customs', 'moc_tpso', 'oae', 'data_go_th'],
      sources: [
        {
          name: 'ระบบสถิติการค้าระหว่างประเทศของไทย (ศุลกากรรายพิกัด HS 4-6 หลัก)',
          org: 'กรมศุลกากร (Thai Customs Department)',
          url: 'https://www.customs.go.th/statistic_report.php',
        },
        {
          name: 'ข้อมูลสถิติการส่งออก-นำเข้าสินค้าเกษตรและอุตสาหกรรมเกษตร',
          org: 'สำนักงานนโยบายและยุทธศาสตร์การค้า (สนค. TPSO) กระทรวงพาณิชย์',
          url: 'https://tpso.go.th',
        },
        {
          name: 'ภาวะเศรษฐกิจการเกษตรและสถิติการค้าสินค้าเกษตรระหว่างประเทศ',
          org: 'สำนักงานเศรษฐกิจการเกษตร (สศก. OAE)',
          url: 'https://www.oae.go.th',
        },
        {
          name: 'ศูนย์กลางข้อมูลเปิดภาครัฐ — ชุดข้อมูลสถิติการค้าและเกษตร',
          org: 'สำนักงานพัฒนารัฐบาลดิจิทัล (สพร. DGA) data.go.th',
          url: 'https://data.go.th',
        },
      ],
      dataAsOf: `${selectedYear}-12-31`,
      datasetVersion: 'agri-trade-reference-v2',
      warnings: [
        'ตัวเลขสถิติในชุดนี้เป็นตัวเลขจำลองเชิงสถิติ (sample: true) อิงพิกัดศุลกากรไทยสำหรับทดสอบและวิเคราะห์ห่วงโซ่มูลค่า',
        'การเผยแพร่ข้อมูลระดับการค้าระหว่างประเทศยังคงสถานะ metadata_only ตามเกณฑ์การบริหารสิทธิ์ของ Hub',
        'มูลค่าใช้หน่วยล้านบาทและปริมาณใช้หน่วยล้านตันแยกกัน; KPI รวมคำนวณจากแถวรายสินค้าของปีเดียว ไม่บวกยอดรวมย่อยซ้ำ',
        `ยอดคู่ค้าที่มีรายละเอียดครอบคลุม ${destinationCoverage.coveragePct}% ของมูลค่าส่งออกรวม (top 5 ต่อสินค้า); ตลาดที่เหลือยังไม่มีรายละเอียดในชุดข้อมูล`,
        ...(yoyAvailable && !prevBaseAvailable
          ? ['อัตราเติบโต YoY ของปีนี้ใช้ค่าที่ประกาศคู่แถวปีนั้น เนื่องจากไม่มีแถวปีก่อนหน้าในชุดข้อมูล']
          : []),
        ...(!yoyAvailable ? ['ไม่มีข้อมูลเพียงพอสำหรับคำนวณ YoY — ระบบไม่เติมค่าประมาณและแสดง yoyAvailable = false'] : []),
      ],
    },
  };
}
