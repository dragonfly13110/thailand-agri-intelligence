import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildGiDashboard,
  giCategoryFromQuery,
  giStandardFromQuery,
  THAILAND_PROVINCES,
  type GiCategory,
  type GiControlStandard,
} from '../../../../lib/hub/gi-data';

export const dynamic = 'force-dynamic';

const VALID_PROVINCE_CODES = new Set(THAILAND_PROVINCES.map((province) => province.code));

/** ป้ายภาค 6 ค่าที่เอกสาร API รับ — ใช้เฉพาะตอนเขียนข้อความเตือน ส่วนค่าจริงที่ส่งเข้าชั้นข้อมูลคือ label ในทะเบียนจังหวัด */
const GI_REGION_LABELS = [
  'ภาคเหนือ',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออก',
  'ภาคตะวันตก',
  'ภาคใต้',
] as const;

const GI_CATEGORY_VALUES = 'rice, fruit, tea_coffee, textile_craft, other';
const GI_CATEGORY_THAI_VALUES = 'ข้าว, ไม้ผล, ชา/กาแฟ, ผ้าไหม/หัตถกรรม, อื่น ๆ';
const GI_STANDARD_VALUES = 'internal_control, external_control, ควบคุมภายใน, ควบคุมภายนอก';

/** 'ภาค' เป็นคำนำหน้าที่ไม่มีความหมายในการกรอง จึงตัดออกก่อนเทียบ (NFC + ตัวพิมพ์เล็ก) */
function regionKey(label: string): string {
  const normalized = label.normalize('NFC').trim().toLowerCase();
  return normalized.startsWith('ภาค') ? normalized.slice('ภาค'.length).trim() : normalized;
}

/** key → ป้ายภาคตามที่เก็บในทะเบียนจังหวัด เพื่อให้ค่าที่ส่งต่อตรงกับข้อมูลจริงเสมอ */
const REGION_LABEL_BY_KEY = new Map<string, string>();
for (const province of THAILAND_PROVINCES) {
  const label = province.region.normalize('NFC').trim();
  if (!label) continue;
  const key = regionKey(label);
  if (key && !REGION_LABEL_BY_KEY.has(key)) REGION_LABEL_BY_KEY.set(key, label);
}
for (const label of GI_REGION_LABELS) {
  const key = regionKey(label);
  if (!REGION_LABEL_BY_KEY.has(key)) REGION_LABEL_BY_KEY.set(key, label);
}

/**
 * GET /api/v1/gi-products
 *
 * สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ (GI) และสายพันธุ์พืชพื้นเมืองของไทย
 * คืนรายการสินค้า GI พร้อมสรุปตามจังหวัด / ภาค / หมวดสินค้า / ระบบควบคุมคุณภาพ (internal vs external control)
 * และช่องว่างการครอบคลุม (coverageNote) เพื่อให้เห็นว่าจังหวัดใดยังไม่มีข้อมูล
 *
 * พารามิเตอร์ (ทุกค่าไม่บังคับ ไม่ระบุหรือ 'all' = ไม่กรอง; ส่งซ้ำรับค่าแรกตาม url.searchParams.get):
 * - provinceCode = รหัสจังหวัด 2 หลักในทะเบียนอ้างอิง 77 จังหวัด (เช่น 10, 20, 50, 80) หรือ 'all'
 * - region = ภาคเหนือ | ภาคตะวันออกเฉียงเหนือ | ภาคกลาง | ภาคตะวันออก | ภาคตะวันตก | ภาคใต้
 *   (พิมพ์ 'เหนือ, กลาง, ใต้ ...' โดยไม่ต้องนำหน้า 'ภาค' ก็ได้) หรือ 'all'
 * - category = rice | fruit | tea_coffee | textile_craft | other
 *   หรือชื่อภาษาไทย ข้าว | ไม้ผล | ชา/กาแฟ | ผ้าไหม/หัตถกรรม | อื่น ๆ หรือ 'all'
 * - standard = internal_control | external_control | ควบคุมภายใน | ควบคุมภายนอก หรือ 'all'
 * - q = ข้อความค้นหาไม่เกิน 100 ตัวอักษร (ชื่อสินค้า GI / commodities / จังหวัด / อำเภอ)
 * - search = คำพ้องความหมายของ q ใช้เมื่อไม่ส่ง q
 *
 * ข้อตกลงกำกับข้อมูล:
 * - data.sample = true เสมอ — ตัวเลขและจำนวนรายการทั้งหมดเป็นชุดตัวอย่างเชิงโครงสร้างที่ยังไม่ผ่านการตรวจสอบ
 *   ห้ามนำไปอ้างอิงเป็นสถิติทางการหรืออ้างในเอกสารราชการ
 * - meta.access/availability = "metadata_only" — สิทธิ์เผยแพร่ข้อมูลตัวเลขจริงยัง pending
 *   จึงเปิดเผยได้เฉพาะตัวอย่างและ metadata; ความครบถ้วนกับวันที่ข้อมูลจริงยังไม่ทราบ
 * - จังหวัด GI ที่ไม่พบรายการที่ตรงเงื่อนไข ยังตอบ HTTP 200 พร้อม meta.availability = "empty" (ไม่ใช่ 404)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawRegion = parseText(url, 'region', 40);
    const rawCategory = parseText(url, 'category', 40);
    const rawStandard = parseText(url, 'standard', 40);
    const rawQuery = parseText(url, 'q', 100) || parseText(url, 'search', 100);

    let provinceCode: string | undefined;
    if (rawProvince && rawProvince !== 'all') {
      if (!VALID_PROVINCE_CODES.has(rawProvince)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `ไม่พบรหัสจังหวัดที่ระบุ: "${rawProvince}" — ต้องเป็นรหัส 2 หลักในทะเบียนจังหวัดอ้างอิง 77 จังหวัดของ Data Hub (เช่น 10, 20, 50, 80) หรือ all`,
        );
      }
      provinceCode = rawProvince;
    }

    let region: string | undefined;
    if (rawRegion && rawRegion !== 'all') {
      const resolved = REGION_LABEL_BY_KEY.get(regionKey(rawRegion));
      if (!resolved) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ region ค่า "${rawRegion}" ไม่รู้จัก — ใช้ได้เฉพาะ ${GI_REGION_LABELS.join(', ')} หรือ all`,
        );
      }
      region = resolved;
    }

    let category: GiCategory | undefined;
    if (rawCategory && rawCategory !== 'all') {
      const resolved = giCategoryFromQuery(rawCategory) ?? giCategoryFromQuery(rawCategory.toLowerCase());
      if (!resolved) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ category ค่า "${rawCategory}" ไม่รู้จัก — ใช้ได้เฉพาะ ${GI_CATEGORY_VALUES} (${GI_CATEGORY_THAI_VALUES}) หรือ all`,
        );
      }
      category = resolved;
    }

    let standard: GiControlStandard | undefined;
    if (rawStandard && rawStandard !== 'all') {
      const resolved = giStandardFromQuery(rawStandard) ?? giStandardFromQuery(rawStandard.toLowerCase());
      if (!resolved) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ standard ค่า "${rawStandard}" ไม่รู้จัก — ใช้ได้เฉพาะ ${GI_STANDARD_VALUES} หรือ all`,
        );
      }
      standard = resolved;
    }

    const payload = buildGiDashboard({
      provinceCode,
      region,
      category,
      standard,
      q: rawQuery || undefined,
    });

    // ค่า filter ที่ถูกแต่ไม่มีรายการตรง = payload ว่าง พร้อม availability 'empty' ไม่ใช่ error
    const hasProducts = Array.isArray(payload.products) && payload.products.length > 0;
    return jsonData(payload, {
      meta: {
        availability: hasProducts ? 'metadata_only' : 'empty',
        // ชุดตัวอย่างเชิงโครงสร้างสร้างแบบ deterministic ไม่มีรอบ refresh จึงไม่มีความหมายของ 'fresh'/'stale'
        freshness: 'unknown',
        // แถวที่มีเป็น sample ไม่ใช่หลักฐานสำหรับประเมิน completeness ของทะเบียนจริง
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: [],
        dataAsOf: null,
        warnings: payload.warnings,
        // ApiMeta มีเฉพาะ 'database' | 'source_api_fallback' จึงใช้ 'database' ตาม lane พี่น้องที่ sample ในโค้ด
        runtimeMode: 'database',
      },
    });
  });
}
