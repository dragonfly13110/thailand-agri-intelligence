/**
 * Agricultural commodity price metadata — metadata-only while rights are pending.
 *
 * Sources: สำนักงานเศรษฐกิจการเกษตร (OAE) และศูนย์ข้อมูลเกษตรแห่งชาติ (NABC)
 *
 * Governance:
 * - The OAE/NABC jasmine-rice price resource is `pending` in
 *   `config/resource_licenses.json`; contractual terms are
 *   "Creative Commons Attributions Non-Commercial" without a confirmed version
 *   or licence URL.
 * - This module intentionally contains **no price, change, percent change or
 *   history series**. The previous fixed snapshot was removed from the web
 *   bundle because publishing pending values through HTML, props, API or cache
 *   is not allowed.
 * - The public API answers `availability: 'metadata_only'`,
 *   `access: 'metadata_only'` and `completeness: 'unknown'`; a numeric series
 *   is only allowed after the resource is approved and an active batch exists.
 */

export type PriceCommodityMetadata = {
  id: string;
  name: string;
  category: 'ข้าว' | 'ยางพาราและปาล์ม' | 'พืชไร่' | 'ปศุสัตว์';
  unit: string;
  marketType: 'ราคาหน้าสวน (Farmgate)' | 'ราคาตลาดกลาง (Wholesale)';
  marketName: string;
  frequency: string;
  sourceName: string;
  sourceUrl: string;
  licenseStatus: 'pending';
  access: 'metadata_only';
};

export const PRICE_SOURCE_METADATA = {
  sourceId: 'oae-nabc-prices',
  sourceName: 'สำนักงานเศรษฐกิจการเกษตร (OAE) / ศูนย์ข้อมูลเกษตรแห่งชาติ (NABC)',
  datasetName: 'ราคาสินค้าเกษตรรายเดือนและรายวัน',
  description:
    'ราคาสินค้าเกษตรสำคัญจาก OAE/NABC แยกตามสินค้า เกรด หน่วย และตลาด รายการราคาต้องไม่นำต่างสินค้า/เกรด/หน่วย/ตลาดมารวมกัน',
  sourceUrl: 'https://catalog.oae.go.th/dataset/monthly_prices_rice',
  licenseStatus: 'pending' as const,
  access: 'metadata_only' as const,
  publicationApproved: false,
  licenseReviewedAt: '2026-10-25',
  limitations: [
    'ทะเบียนสิทธิ์ยังเป็น pending: ระบุ Creative Commons Attributions Non-Commercial แต่ไม่มีรุ่นหรือ URL ของสัญญาอนุญาต',
    'ยังไม่ยืนยันเงื่อนไข API และขอบเขตการใช้ในโครงการ',
    'คำประกาศสิทธิ์ของชุดข้าวยังไม่ครอบคลุมทุกสินค้าหรือทุก endpoint ของ NABC',
    'ยังไม่มี active approved numeric batch ใน D1',
  ],
};

export const PRICE_COMMODITIES: PriceCommodityMetadata[] = [
  {
    id: 'jasmine-rice',
    name: 'ข้าวเปลือกหอมมะลิ (ความชื้น 15%)',
    category: 'ข้าว',
    unit: 'บาท/ตัน',
    marketType: 'ราคาหน้าสวน (Farmgate)',
    marketName: 'ตลาดกลางข้าวเปลือก จ.สุพรรณบุรี / นครราชสีมา',
    frequency: 'รายเดือน (NABC monthly_prices_rice)',
    sourceName: 'OAE / NABC',
    sourceUrl: 'https://catalog.oae.go.th/dataset/monthly_prices_rice',
    licenseStatus: 'pending',
    access: 'metadata_only',
  },
  {
    id: 'white-rice',
    name: 'ข้าวเปลือกเจ้า 5% (ความชื้น 15%)',
    category: 'ข้าว',
    unit: 'บาท/ตัน',
    marketType: 'ราคาหน้าสวน (Farmgate)',
    marketName: 'ท่าข้าวและโรงสีภาคกลาง',
    frequency: 'ตามรอบประกาศต้นทาง (ยังไม่เชื่อม)',
    sourceName: 'OAE / NABC',
    sourceUrl: 'https://catalog.oae.go.th/',
    licenseStatus: 'pending',
    access: 'metadata_only',
  },
  {
    id: 'rubber-sheet',
    name: 'ยางแผ่นดิบคุณภาพ 3',
    category: 'ยางพาราและปาล์ม',
    unit: 'บาท/กก.',
    marketType: 'ราคาตลาดกลาง (Wholesale)',
    marketName: 'ตลาดกลางยางพารา อ.หาดใหญ่ จ.สงขลา',
    frequency: 'ตามรอบประกาศต้นทาง (ยังไม่เชื่อม)',
    sourceName: 'OAE / NABC',
    sourceUrl: 'https://catalog.oae.go.th/',
    licenseStatus: 'pending',
    access: 'metadata_only',
  },
  {
    id: 'oil-palm',
    name: 'ผลปาล์มน้ำมันสด (อัตราน้ำมัน 18%)',
    category: 'ยางพาราและปาล์ม',
    unit: 'บาท/กก.',
    marketType: 'ราคาหน้าสวน (Farmgate)',
    marketName: 'ลานเทและโรงงานสกัด จ.สุราษฎร์ธานี / กระบี่',
    frequency: 'ตามรอบประกาศต้นทาง (ยังไม่เชื่อม)',
    sourceName: 'OAE / NABC',
    sourceUrl: 'https://catalog.oae.go.th/',
    licenseStatus: 'pending',
    access: 'metadata_only',
  },
  {
    id: 'cassava',
    name: 'หัวมันสำปะหลังสด (เชื้อแป้ง 25%)',
    category: 'พืชไร่',
    unit: 'บาท/กก.',
    marketType: 'ราคาหน้าสวน (Farmgate)',
    marketName: 'ลานมัน จ.นครราชสีมา / กำแพงเพชร',
    frequency: 'ตามรอบประกาศต้นทาง (ยังไม่เชื่อม)',
    sourceName: 'OAE / NABC',
    sourceUrl: 'https://catalog.oae.go.th/',
    licenseStatus: 'pending',
    access: 'metadata_only',
  },
  {
    id: 'feed-maize',
    name: 'ข้าวโพดเลี้ยงสัตว์ (ความชื้น 14.5%)',
    category: 'พืชไร่',
    unit: 'บาท/กก.',
    marketType: 'ราคาตลาดกลาง (Wholesale)',
    marketName: 'หน้าโรงงานอาหารสัตว์ กรุงเทพฯ และปริมณฑล',
    frequency: 'ตามรอบประกาศต้นทาง (ยังไม่เชื่อม)',
    sourceName: 'OAE / NABC',
    sourceUrl: 'https://catalog.oae.go.th/',
    licenseStatus: 'pending',
    access: 'metadata_only',
  },
];

export const PRICE_WARNINGS = [
  'ยังไม่เปิดเผยราคา เปลี่ยนแปลง หรือประวัติราคา เพราะทะเบียนสิทธิ์ของ OAE/NABC ยังเป็น pending',
  'shown values: none — response นี้เป็น metadata-only ไม่มีตัวเลขราคาจากต้นทาง',
  'ห้ามนำรายการนี้ไปใช้แทนราคาทางการ และห้ามรวมราคาต่างสินค้า/เกรด/หน่วย/ตลาด',
  'จะเปิดราคาได้เมื่อมีหลักฐานสิทธิ์ครบและมี active approved batch ที่ตรวจเทียบกับต้นทางแล้วเท่านั้น',
];

export function getCommodityPrices(category?: string): PriceCommodityMetadata[] {
  if (!category || category === 'all') return PRICE_COMMODITIES;
  return PRICE_COMMODITIES.filter((p) => p.category === category);
}

export function getCommodityById(id: string): PriceCommodityMetadata | undefined {
  return PRICE_COMMODITIES.find((p) => p.id === id);
}
