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
 * - The daily market-price resource is `pending` in
 *   `config/resource_licenses.json` (the register currently only carries the
 *   *monthly* jasmine-paddy row `oae_nabc_monthly_jasmine_paddy_price`, still
 *   `pending`, with no confirmed licence version/URL).
 * - `PRICE_PUBLICATION_APPROVED` below is the ONE switch that turns the real
 *   numbers on. It stays `false` until the Integrator flips the exact registry
 *   row to `approved_public` **and** sets this switch to `true`. While it is
 *   `false` the API answers the metadata-only envelope with an empty
 *   `prices` array — no price, change, percentage or history series ever
 *   leaves this module.
 * - The upstream does **not** publish a price type (farmgate vs wholesale) or a
 *   separate grade field per row: the grade is spelled inside the product
 *   name. Those fields therefore stay `null` with an explicit status instead of
 *   being guessed. The unit is published per row by the source; when a row has
 *   no unit the value is `null` + `unitStatus: 'pending_official_confirmation'`.
 */

export type PriceLicenseStatus = 'pending' | 'approved_public';
export type PriceAccessStatus = 'metadata_only' | 'approved_public';

/**
 * The single publication switch for the live OAE/NABC daily market prices.
 *
 * Flip to `true` **only** after the Integrator has registered the exact
 * upstream daily endpoint as `approved_public` with
 * `project_publication_approved = true` in `config/resource_licenses.json`.
 * Flipping this switch is not enough on its own: the registry row is the
 * licence decision, this switch is the wiring that honours it.
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
    'ราคาสินค้าเกษตรสำคัญจาก OAE/NABC แยกตามสินค้า เกรด หน่วย และตลาด รายการราคาต้องไม่นำต่างสินค้า/เกรด/หน่วย/ตลาดมารวมกัน',
  sourceUrl: PRICE_CATALOGUE_URL,
  endpointUrl: PRICE_ROW_ENDPOINT,
  grain: PRICE_GRAIN,
  grainLabel: PRICE_GRAIN_LABEL,
  frequency: 'รายวัน (NABC daily-prices)',
  licenseStatus: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'pending',
  access: PRICE_PUBLICATION_APPROVED ? 'approved_public' : 'metadata_only',
  publicationApproved: PRICE_PUBLICATION_APPROVED,
  licenseReviewedAt: '2026-10-26',
  limitations: [
    'ทะเบียนสิทธิ์ของ resource ราคารายวันรายตลาด (NABC daily-prices) ยังไม่มีแถวที่อนุมัติ: แถวเดียวที่มีอยู่คือราคารายเดือนข้าวหอมมะลิ (oae_nabc_monthly_jasmine_paddy_price) ซึ่งยังเป็น pending',
    'ทะเบียนระบุเงื่อนไข Creative Commons Attributions Non-Commercial แต่ยังไม่มีรุ่นหรือ URL ของสัญญาอนุญาต และยังไม่ยืนยันว่าการใช้งานในโครงการนี้เข้าข่ายเงื่อนไขดังกล่าว',
    'ต้นทางไม่ประกาศประเภทราคา (หน้าสวน/ตลาดกลาง) แยกต่างหาก ฟิลด์ priceType จึงเป็น null และห้ามตีความเอง',
    'ต้นทางไม่ประกาศเกรดเป็นคอลัมน์แยก เกรดปรากฏอยู่ในชื่อสินค้าของต้นทางเท่านั้น ฟิลด์ grade จึงเป็น null และห้ามเดาจากชื่อ',
    'หน่วยถูกประกาศในแต่ละแถวของต้นทาง หน่วยใน metadata เป็นค่าที่ตรวจแล้ว ณ 2026-10-26 แต่หน่วยระดับแถวของต้นทางยังมีอันดับสูงกว่าเสมอ',
    'ความถี่ของต้นทางเป็นรายวันแต่บางสินค้าประกาศไม่ทุกวัน จึงต้องอ้างวันที่ของแต่ละแถวเสมอ ไม่ใช้วันที่ของคำขอแทน',
    'อินเทอร์เฟซอ่านครั้งละหนึ่งหน้า (limit=100, page=1) แบบจำกัดจำนวนคำขอ ประวัติย้อนหลังทั้งหมดจึงยังไม่ครบถ้วน',
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
  'ยังไม่เปิดเผยราคา เปลี่ยนแปลง หรือประวัติราคา เพราะทะเบียนสิทธิ์ของ resource ราคารายวันรายตลาด (NABC daily-prices) ยังไม่มีแถวที่อนุมัติ',
  'shown values: none — response นี้เป็น metadata-only ไม่มีตัวเลขราคาจากต้นทาง',
  'ห้ามนำรายการนี้ไปใช้แทนราคาทางการ และห้ามรวมราคาต่างสินค้า/เกรด/หน่วย/ตลาด',
  'จะเปิดราคาได้เมื่อมีหลักฐานสิทธิ์ครบและมี active approved batch ที่ตรวจเทียบกับต้นทางแล้วเท่านั้น',
  'ต้นทางราคารายวันรายตลาดตอบกลับได้จริง (bounded probe วันที่ 2026-10-26: HTTP 200, มีรายการสินค้าให้เรียก) สถานะที่ยังเป็น metadata-only เป็นเพราะสิทธิ์ยังไม่อนุมัติ ไม่ใช่เพราะต้นทางใช้ไม่ได้',
  'เกรดของแต่ละสินค้าปรากฏอยู่ในชื่อสินค้าของต้นทาง ไม่มีคอลัมน์เกรดแยก และต้นทางไม่ประกาศประเภทราคา (หน้าสวน/ตลาดกลาง) จึงไม่มีการอนุมานค่าใด ๆ ในสองฟิลด์นี้',
];

export function getCommodityPrices(category?: string): PriceCommodityMetadata[] {
  if (!category || category === 'all') return PRICE_COMMODITIES;
  return PRICE_COMMODITIES.filter((p) => p.category === category);
}

export function getCommodityById(id: string): PriceCommodityMetadata | undefined {
  return PRICE_COMMODITIES.find((p) => p.id === id);
}
