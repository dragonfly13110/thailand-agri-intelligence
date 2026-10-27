export const SUPPORTED_TRADE_YEARS = [2024, 2023, 2022] as const;
export const SUPPORTED_TRADE_COMMODITIES = ['rice', 'rubber', 'cassava', 'palm', 'durian'] as const;

export type TradeDashboardPayload = {
  sample: false;
  selectedYear: number;
  selectedCommodity: string;
  availableYears: number[];
  availableCommodities: Array<{ id: string; name: string; hsCode: string }>;
  kpi: null;
  tradeBalances: [];
  topDestinationsOverall: [];
  destinationCoverage: null;
  commodityDetail: null;
  allCommodities: [];
  meta: {
    access: 'metadata_only';
    availability: 'empty';
    sourceIds: string[];
    sources: Array<{ name: string; org: string; url: string }>;
    dataAsOf: null;
    datasetVersion: null;
    warnings: string[];
  };
};

const warnings = [
  'แหล่ง Customs/OAE ที่ตรวจได้มีเพียง metadata; ยังไม่มีระเบียนตัวเลขนำเข้า-ส่งออกที่อนุมัติให้เผยแพร่',
  'ก่อนเผยแพร่ต้องมีช่วงเวลา สินค้าหรือ HS code ประเภทนำเข้า/ส่งออก หน่วย มูลค่า/สกุลเงิน และหลักฐานสิทธิ์',
  'ราคาตลาดรายวันของ NABC เป็นคนละชุดข้อมูลกับสถิติการค้า จึงไม่นำมาใช้แทนข้อมูลนำเข้า-ส่งออก',
];

export function buildTradeDashboard(options?: { year?: number; commodityId?: string }): TradeDashboardPayload {
  const selectedYear = SUPPORTED_TRADE_YEARS.find((year) => year === options?.year) ?? SUPPORTED_TRADE_YEARS[0];
  const rawCommodity = options?.commodityId?.toLowerCase().trim() ?? 'all';
  const commodityId = rawCommodity === 'oil-palm' ? 'palm' : rawCommodity;

  return {
    sample: false,
    selectedYear,
    selectedCommodity: commodityId === 'all'
      || SUPPORTED_TRADE_COMMODITIES.includes(commodityId as typeof SUPPORTED_TRADE_COMMODITIES[number])
      ? commodityId
      : 'all',
    availableYears: [],
    availableCommodities: [],
    kpi: null,
    tradeBalances: [],
    topDestinationsOverall: [],
    destinationCoverage: null,
    commodityDetail: null,
    allCommodities: [],
    meta: {
      access: 'metadata_only',
      availability: 'empty',
      sourceIds: [],
      sources: [],
      dataAsOf: null,
      datasetVersion: null,
      warnings,
    },
  };
}
