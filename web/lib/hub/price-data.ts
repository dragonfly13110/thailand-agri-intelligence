/**
 * Agricultural commodity price contract — OAE/NABC daily market prices.
 *
 * Sources:
 * - สำนักงานเศรษฐกิจการเกษตร (OAE) / ศูนย์ข้อมูลเกษตรแห่งชาติ (NABC)
 *   live catalogue: https://agriapi.nabc.go.th/api/daily-prices/product-names
 *   live rows    : https://agriapi.nabc.go.th/api/daily-prices/product
 *
 * GRAIN (the single most important property of this dataset):
 *   One published number = one upstream product (commodity **and** grade as the
 *   source spells it) × one market × one province × one calendar day × one
 *   unit. Nothing here may be averaged, summed or otherwise rolled up across
 *   products, grades, units or markets, and a repeated market/date identity is
 *   de-duplicated instead of being added twice.
 *
 * Governance:
 * - Publication is enabled: `PRICE_PUBLICATION_APPROVED` is `true` under the
 *   project's Full Production Unlocked policy (AGENTS.md rule 3). Every
 *   published row keeps its own product/grade, market, province, day and unit
 *   and carries the source caveats in `PRICE_WARNINGS`.
 * - `config/resource_licenses.json` records this exact endpoint as
 *   `oae_nabc_daily_market_prices` under the owner authorization in AGENTS.md.
 *   Its separate monthly-price resource remains pending.
 * - The upstream does **not** publish a price type (farmgate vs wholesale) or a
 *   separate grade field per row: the grade is spelled inside the product
 *   name. Those fields therefore stay `null` with an explicit status instead of
 *   being guessed. The unit is published per row by the source; when a row has
 *   no unit the value is `null` + `unitStatus: 'pending_official_confirmation'`.
 */

export type PriceLicenseStatus = 'pending' | 'approved_public';
export type PriceAccessStatus = 'metadata_only' | 'approved_public';

/**
 * Publication switch for the live OAE/NABC daily market prices.
 *
 * Enabled under the project's Full Production Unlocked policy (AGENTS.md rule
 * 3): the upstream is the public OAE/NABC API and every published row keeps
 * source attribution plus the per-row caveats in `PRICE_WARNINGS`. Keep the
 * exact daily resource evidence in `config/resource_licenses.json` aligned with
 * this decision.
 */
export const PRICE_PUBLICATION_APPROVED = true;

/** Machine-readable grain of every published number. */
export const PRICE_GRAIN = 'market × commodity(grade) × province × day';

/** Thai description of the same grain, shown next to the API contract. */
export const PRICE_GRAIN_LABEL = 'หนึ่งตัวเลข = หนึ่งสินค้า/เกรด × หนึ่งตลาด × หนึ่งจังหวัด × หนึ่งวัน × หนึ่งหน่วย';

export const PRICE_SOURCE_NAME = 'สำนักงานเศรษฐกิจการเกษตร (OAE) / ศูนย์ข้อมูลเกษตรแห่งชาติ (NABC)';

/** Upstream catalogue of the products that publish a daily market price. */
export const PRICE_CATALOGUE_URL = 'https://agriapi.nabc.go.th/api/daily-prices/product-names';

/** Upstream row endpoint (one exact `product_name` per request). */
export const PRICE_ROW_ENDPOINT = 'https://agriapi.nabc.go.th/api/daily-prices/product';

export type PriceUpstreamProduct = {
  /** Metadata id in `PRICE_COMMODITIES` that this upstream product backs. */
  commodityId: string;
  /** The exact upstream `product_name`; it is never re-spelled here. */
  productName: string;
};

/**
 * The upstream products this hub follows. Every name below is copied verbatim
 * from `https://agriapi.nabc.go.th/api/daily-prices/product-names`
 * (verified 2026-10-26, 41 products offered by the source).
 */
export const PRICE_UPSTREAM_PRODUCTS: PriceUpstreamProduct[] = [
  { commodityId: 'jasmine-rice', productName: 'ข้าวเปลือกเจ้าหอมมะลิ 105' },
  { commodityId: 'white-rice', productName: 'ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%' },
  { commodityId: 'rubber-sheet', productName: 'ยางพาราแผ่นดิบ ชั้น 3' },
  { commodityId: 'oil-palm', productName: 'ผลปาล์มน้ำมันทั้งทะลาย คละ' },
  { commodityId: 'cassava', productName: 'หัวมันสำปะหลังสด (แป้ง 25%)' },
  { commodityId: 'feed-maize', productName: 'ข้าวโพดเลี้ยงสัตว์ ความชื้น 14.5%' },
];

export type PriceSourceMetadata = {
  sourceId: string;
  sourceName: string;
  datasetName: string;
  description: string;
  sourceUrl: string;
  endpointUrl: string;
  grain: string;
  grainLabel: string;
  frequency: string;
  licenseStatus: PriceLicenseStatus;
  access: PriceAccessStatus;
  publicationApproved: boolean;
  licenseReviewedAt: string;
  limitations: string[];
};

export const PRICE_SOURCE_METADATA: PriceSourceMetadata = {
  sourceId: 'oae-nabc-prices',
  sourceName: PRICE_SOURCE_NAME,
  datasetName: 'ราคาสินค้าเกษตรรายวันรายตลาด (NABC daily-prices)',
  description:
    'ราคาสินค้าเกษตรสำคัญจาก OAE/NABC ที่เผยแพร่รายวัน แยกตามสินค้า/เกรด หน่วย และตลาดแบบรายแถว ห้ามนำต่างสินค้า/เกรด/หน่วย/ตลาดมารวมกัน',
  sourceUrl: PRICE_CATALOGUE_URL,
  endpointUrl: PRICE_ROW_ENDPOINT,
  grain: PRICE_GRAIN,
  grainLabel: PRICE_GRAIN_LABEL,
  frequency: 'รายวัน (NABC daily-prices)',
  licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
  access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  publicationApproved: PRICE_PUBLICATION_APPROVED,
  licenseReviewedAt: '2026-10-27',
  limitations: [
    'ต้นทางไม่ประกาศเกรดเป็นคอลัมน์แยก เกรดปรากฏอยู่ในชื่อสินค้า (เช่น ชั้น 3, ความชื้น 15%, แป้ง 25%) ฟิลด์ grade จึงเป็น null และห้ามเดาจากชื่อหรือเติมเกรดเอง',
    'ต้นทางไม่ประกาศประเภทราคา (หน้าสวน/ตลาดกลาง/ขายส่ง) แยกต่างหาก ฟิลด์ priceType จึงเป็น null และห้ามตีความเอง',
    'หน่วยถูกประกาศในแต่ละแถวของต้นทาง หน่วยใน metadata เป็นเพียงค่าอ้างอิง หน่วยระดับแถวของต้นทางมีอันดับสูงกว่าเสมอ และห้ามแปลงหน่วยเพื่อนำมาเปรียบเทียบ',
    'ความถี่ของต้นทางเป็นรายวันแต่บางสินค้าประกาศไม่ทุกวัน จึงต้องอ้างวันที่ของแต่ละแถวเสมอ ไม่ใช้วันที่ของคำขอแทน',
    'อินเทอร์เฟซอ่านครั้งละหนึ่งหน้า (limit=100, page=1) แบบจำกัดจำนวนคำขอ ประวัติย้อนหลังทั้งหมดจึงยังไม่ครบถ้วน',
    'ชื่อตลาด/ผู้ค้า/โรงสีเป็นข้อความตามต้นทาง ไม่ได้แปลงเป็นรหัสหรือมาตรฐานตลาด และจังหวัดเป็นชื่อ ไม่ใช่รหัส 77 จังหวัด',
    'การเผยแพร่เป็นไปตามนโยบาย Full Production Unlocked ของโครงการ (AGENTS.md ข้อ 3) ต้องคงการอ้างอิง OAE/NABC และตรวจเงื่อนไขการใช้ข้อมูลล่าสุดของต้นทางก่อนนำไปใช้เชิงพาณิชย์',
  ],
};

export type PriceCommodityMetadata = {
  id: string;
  name: string;
  category: 'ข้าว' | 'ยางพาราและปาล์ม' | 'พืชไร่' | 'ปศุสัตว์';
  unit: string;
  marketType: string;
  marketName: string;
  frequency: string;
  sourceName: string;
  sourceUrl: string;
  /** Exact upstream `product_name`; `null` when the upstream offers no match. */
  sourceProductName: string | null;
  grain: string;
  licenseStatus: PriceLicenseStatus;
  access: PriceAccessStatus;
};

export const PRICE_COMMODITIES: PriceCommodityMetadata[] = [
  {
    id: 'jasmine-rice',
    name: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
    category: 'ข้าว',
    unit: 'บาท/ตัน',
    marketType: 'ไม่ระบุประเภทราคาโดยต้นทาง (ราคาประจำตลาดที่ต้นทางเผยแพร่)',
    marketName: 'หลายตลาด/หลายจังหวัดตามที่ต้นทางประกาศรายวัน (ดูรายละเอียดใน prices[])',
    frequency: 'รายวัน (NABC daily-prices)',
    sourceName: PRICE_SOURCE_NAME,
    sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product?product_name=%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B9%80%E0%B8%88%E0%B9%89%E0%B8%B2%E0%B8%AB%E0%B8%AD%E0%B8%A1%E0%B8%A1%E0%B8%B0%E0%B8%A5%E0%B8%B4%20105&limit=100&page=1',
    sourceProductName: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
    grain: PRICE_GRAIN,
    licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
    access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  },
  {
    id: 'white-rice',
    name: 'ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%',
    category: 'ข้าว',
    unit: 'บาท/ตัน',
    marketType: 'ไม่ระบุประเภทราคาโดยต้นทาง (ราคาประจำตลาดที่ต้นทางเผยแพร่)',
    marketName: 'หลายตลาด/หลายจังหวัดตามที่ต้นทางประกาศรายวัน (ดูรายละเอียดใน prices[])',
    frequency: 'รายวัน (NABC daily-prices)',
    sourceName: PRICE_SOURCE_NAME,
    sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product?product_name=%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B9%80%E0%B8%88%E0%B9%89%E0%B8%B2%E0%B8%AB%E0%B8%AD%E0%B8%A1%E0%B8%A1%E0%B8%B0%E0%B8%A5%E0%B8%B4%20%E0%B8%84%E0%B8%A7%E0%B8%B2%E0%B8%A1%E0%B8%8A%E0%B8%B7%E0%B9%89%E0%B8%99%2015%25&limit=100&page=1',
    sourceProductName: 'ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%',
    grain: PRICE_GRAIN,
    licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
    access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  },
  {
    id: 'rubber-sheet',
    name: 'ยางพาราแผ่นดิบ ชั้น 3',
    category: 'ยางพาราและปาล์ม',
    unit: 'บาท/กก.',
    marketType: 'ไม่ระบุประเภทราคาโดยต้นทาง (ราคาประจำตลาดที่ต้นทางเผยแพร่)',
    marketName: 'หลายตลาด/หลายจังหวัดตามที่ต้นทางประกาศรายวัน (ดูรายละเอียดใน prices[])',
    frequency: 'รายวัน (NABC daily-prices)',
    sourceName: PRICE_SOURCE_NAME,
    sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product?product_name=%E0%B8%A2%E0%B8%B2%E0%B8%87%E0%B8%9E%E0%B8%B2%E0%B8%A3%E0%B8%B2%E0%B9%81%E0%B8%9C%E0%B9%88%E0%B8%99%E0%B8%94%E0%B8%B4%E0%B8%9A%20%E0%B8%8A%E0%B8%B1%E0%B8%99%203&limit=100&page=1',
    sourceProductName: 'ยางพาราแผ่นดิบ ชั้น 3',
    grain: PRICE_GRAIN,
    licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
    access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  },
  {
    id: 'oil-palm',
    name: 'ผลปาล์มน้ำมันทั้งทะลาย คละ',
    category: 'ยางพาราและปาล์ม',
    unit: 'บาท/กก.',
    marketType: 'ไม่ระบุประเภทราคาโดยต้นทาง (ราคาประจำตลาดที่ต้นทางเผยแพร่)',
    marketName: 'หลายตลาด/หลายจังหวัดตามที่ต้นทางประกาศรายวัน (ดูรายละเอียดใน prices[])',
    frequency: 'รายวัน (NABC daily-prices)',
    sourceName: PRICE_SOURCE_NAME,
    sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product?product_name=%E0%B8%9C%E0%B8%A5%E0%B8%9B%E0%B8%B2%E0%B8%A5%E0%B9%8C%E0%B8%A1%E0%B8%99%E0%B8%B3%E0%B8%A1%E0%B8%B1%E0%B8%99%E0%B8%97%E0%B8%B1%E0%B8%9A%E0%B8%A3%E0%B8%B2%E0%B8%94%E0%B8%A3%E0%B8%B0%20%E0%B8%84%E0%B8%A5%E0%B8%B0&limit=100&page=1',
    sourceProductName: 'ผลปาล์มน้ำมันทั้งทะลาย คละ',
    grain: PRICE_GRAIN,
    licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
    access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  },
  {
    id: 'cassava',
    name: 'หัวมันสำปะหลังสด (แป้ง 25%)',
    category: 'พืชไร่',
    unit: 'บาท/กก.',
    marketType: 'ไม่ระบุประเภทราคาโดยต้นทาง (ราคาประจำตลาดที่ต้นทางเผยแพร่)',
    marketName: 'หลายตลาด/หลายจังหวัดตามที่ต้นทางประกาศรายวัน (ดูรายละเอียดใน prices[])',
    frequency: 'รายวัน (NABC daily-prices)',
    sourceName: PRICE_SOURCE_NAME,
    sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product?product_name=%E0%B8%AB%E0%B8%B1%E0%B8%A7%E0%B8%A1%E0%B8%B1%E0%B8%99%E0%B8%AA%E0%B8%B3%E0%B8%9B%E0%B8%B0%E0%B8%AB%E0%B8%A5%E0%B8%B1%E0%B8%87%E0%B8%AA%E0%B8%94%20%28%E0%B9%81%E0%B8%9B%E0%B9%89%E0%B8%87%2025%25%29&limit=100&page=1',
    sourceProductName: 'หัวมันสำปะหลังสด (แป้ง 25%)',
    grain: PRICE_GRAIN,
    licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
    access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  },
  {
    id: 'feed-maize',
    name: 'ข้าวโพดเลี้ยงสัตว์ ความชื้น 14.5%',
    category: 'พืชไร่',
    unit: 'บาท/กก.',
    marketType: 'ไม่ระบุประเภทราคาโดยต้นทาง (ราคาประจำตลาดที่ต้นทางเผยแพร่)',
    marketName: 'หลายตลาด/หลายจังหวัดตามที่ต้นทางประกาศรายวัน (ดูรายละเอียดใน prices[])',
    frequency: 'รายวัน (NABC daily-prices)',
    sourceName: PRICE_SOURCE_NAME,
    sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product?product_name=%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7%E0%B9%82%E0%B8%9E%E0%B8%94%E0%B9%80%E0%B8%A5%E0%B8%B5%E0%B9%89%E0%B8%87%E0%B8%AA%E0%B8%B1%E0%B8%95%E0%B9%8A%E0%B8%A7%20%E0%B8%84%E0%B8%A7%E0%B8%B2%E0%B8%A1%E0%B8%8A%E0%B8%B7%E0%B9%89%E0%B8%99%2014.5%25&limit=100&page=1',
    sourceProductName: 'ข้าวโพดเลี้ยงสัตว์ ความชื้น 14.5%',
    grain: PRICE_GRAIN,
    licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
    access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  },
];

export const PRICE_WARNINGS = [
  'ตัวเลขที่แสดงเป็นราคาที่ต้นทาง OAE/NABC เผยแพร่จริงรายวัน หนึ่งรายการ = หนึ่งสินค้า/เกรด × หนึ่งตลาด × หนึ่งจังหวัด × หนึ่งวัน × หนึ่งหน่วย ห้ามเฉลี่ย รวม หรือเปรียบเทียบข้ามตลาด หน่วย หรือเกรด',
  'เกรด (เช่น ชั้น 3, ความชื้น 15%, แป้ง 25%) อยู่ในชื่อสินค้าตามที่ต้นทางประกาศ ไม่มีคอลัมน์เกรดแยก ฟิลด์ grade จึงเป็น null และห้ามตีความหรือเติมเกรดเอง',
  'ต้นทางไม่ประกาศประเภทราคา (ราคาหน้าสวน/ราคาขายส่ง/ตลาดกลาง) แยกต่างหาก ฟิลด์ priceType จึงเป็น null และห้ามอนุมานว่าเป็นราคาประเภทใด',
  'ค่าว่างคงเป็น null และแสดงเป็น — เท่านั้น ห้ามแทนด้วย 0; แถวที่ต้นทางไม่มีหน่วยจะแสดง — พร้อมสถานะรอยืนยันหน่วย',
  'แต่ละสินค้าอาจมีวันข้อมูลล่าสุดไม่ตรงกัน และหน้านี้อ่านเพียงหน้าแรก (limit=100, page=1) จึงไม่ใช่ประวัติย้อนหลังทั้งหมด ต้องอ้างวันที่ของแต่ละแถวเสมอ',
  'ใช้ข้อมูลโดยอ้างอิง OAE/NABC และไม่นำไปใช้แทนราคาทางการหรือประกาศของหน่วยงาน; ตรวจเงื่อนไขการใช้ข้อมูลล่าสุดของต้นทางก่อนเผยแพร่ต่อ',
];

export function getCommodityPrices(category?: string): PriceCommodityMetadata[] {
  if (!category || category === 'all') return PRICE_COMMODITIES;
  return PRICE_COMMODITIES.filter((p) => p.category === category);
}

export function getCommodityById(id: string): PriceCommodityMetadata | undefined {
  return PRICE_COMMODITIES.find((p) => p.id === id);
}
