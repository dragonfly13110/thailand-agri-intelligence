import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildFoodSafetyDashboard,
  FOOD_SAFETY_COMMODITY_IDS,
  FOOD_SAFETY_COMMODITY_NAME_ALIASES,
  FOOD_SAFETY_PROVINCE_CODES,
  FOOD_SAFETY_STANDARDS,
  REGION_LABEL_BY_KEY,
  type FoodSafetyFilters,
  type MandateType,
  type StandardId,
} from '../../../../lib/hub/food-safety-data';
import { REGIONS, type RegionKey } from '../../../../lib/hub/weather-data';

export const dynamic = 'force-dynamic';

/* ทุกค่าที่ตรงกับ all-tokens หมายถึง "ไม่กรอง" เพื่อให้ทั้ง API และผู้ใช้ไทยพิมพ์สลับกันได้ */
const ALL_TOKENS = new Set(['all', 'ทั้งหมด', 'ทุกภาค', 'ทุกมาตรฐาน', 'ทุกสินค้า', 'ทุกประเภท']);

const REGION_ALIASES = new Map<string, RegionKey>([
  ['north', 'north'],
  ['เหนือ', 'north'],
  ['ภาคเหนือ', 'north'],
  ['northeast', 'northeast'],
  ['อีสาน', 'northeast'],
  ['ภาคอีสาน', 'northeast'],
  ['ตะวันออกเฉียงเหนือ', 'northeast'],
  ['ภาคตะวันออกเฉียงเหนือ', 'northeast'],
  ['central', 'central'],
  ['กลาง', 'central'],
  ['ภาคกลาง', 'central'],
  ['east', 'east'],
  ['ตะวันออก', 'east'],
  ['ภาคตะวันออก', 'east'],
  ['south', 'south'],
  ['ใต้', 'south'],
  ['ภาคใต้', 'south'],
]);

/** 'gap' ลอย ๆ หมายถึง GAP พืชเพราะเป็นมาตรฐานหลักของหน้าจอ; GAP ปศุสัตว์/ประมงต้องระบุให้เต็ม */
const STANDARD_ALIASES = new Map<string, StandardId>([
  ['gap_crop', 'gap_crop'],
  ['gap', 'gap_crop'],
  ['gapcrop', 'gap_crop'],
  ['gapพืช', 'gap_crop'],
  ['gap.พืช', 'gap_crop'],
  ['pdo', 'gap_crop'],
  ['good_agriculture_practices', 'gap_crop'],
  ['gap_livestock', 'gap_livestock'],
  ['gaplivestock', 'gap_livestock'],
  ['livestock', 'gap_livestock'],
  ['gapปศุสัตว์', 'gap_livestock'],
  ['gap.ปศุสัตว์', 'gap_livestock'],
  ['gap_fishery', 'gap_fishery'],
  ['gapfishery', 'gap_fishery'],
  ['fishery', 'gap_fishery'],
  ['aquaculture', 'gap_fishery'],
  ['gapประมง', 'gap_fishery'],
  ['gap.ประมง', 'gap_fishery'],
  ['gapสัตว์น้ำ', 'gap_fishery'],
  ['organic_thailand', 'organic_thailand'],
  ['organic', 'organic_thailand'],
  ['organicthailand', 'organic_thailand'],
  ['อินทรีย์', 'organic_thailand'],
  ['เกษตรอินทรีย์', 'organic_thailand'],
  ['ออแกนิค', 'organic_thailand'],
  ['ออแกนิก', 'organic_thailand'],
  ['chemical_residue', 'chemical_residue'],
  ['residue', 'chemical_residue'],
  ['mrl', 'chemical_residue'],
  ['สารตกค้าง', 'chemical_residue'],
  ['ตกค้าง', 'chemical_residue'],
]);

const MANDATE_ALIASES = new Map<string, MandateType>([
  ['mandatory', 'mandatory'],
  ['บังคับ', 'mandatory'],
  ['ภาคบังคับ', 'mandatory'],
  ['voluntary', 'voluntary'],
  ['สมัครใจ', 'voluntary'],
]);

const STANDARD_IDS = FOOD_SAFETY_STANDARDS.map((standard) => standard.id);
const ACCEPTED_REGIONS = REGIONS.map((region) => `${region.key} (${REGION_LABEL_BY_KEY[region.key]})`).join(', ');
const ACCEPTED_STANDARDS = STANDARD_IDS.join(', ');
const ACCEPTED_MANDATES = 'mandatory, voluntary';
const ACCEPTED_COMMODITIES = FOOD_SAFETY_COMMODITY_IDS.join(', ');

function readToken(url: URL, name: string, maxLength: number): string {
  const raw = parseText(url, name, maxLength).normalize('NFC');
  if (!raw || ALL_TOKENS.has(raw.toLowerCase())) return 'all';
  return raw;
}

/** ไม่กลืนค่า enum ที่ไม่รู้จักเงียบ ๆ: ตอบ 400 พร้อมรายการที่รับได้ ผู้เรียกจึงแก้พารามิเตอร์ได้ตรงจุด */
function pickEnum<T extends string>(
  raw: string,
  name: string,
  table: Map<string, T>,
  accepted: string,
): T | 'all' {
  if (raw === 'all') return 'all';
  const value = table.get(raw.toLowerCase());
  if (!value) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      `พารามิเตอร์ ${name} ค่า "${raw}" ไม่รู้จัก — ใช้ได้เฉพาะ ${accepted} หรือ all`,
    );
  }
  return value;
}

function pickProvinceCode(raw: string): string {
  if (raw === 'all') return 'all';
  if (!/^\d{2}$/.test(raw) || !FOOD_SAFETY_PROVINCE_CODES.has(raw)) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      `ไม่พบรหัสจังหวัด "${raw}" — ต้องเป็นรหัส 2 หลักในตารางจังหวัด 77 จังหวัดของ Data Hub (เช่น 10, 20, 57, 96) หรือ all`,
    );
  }
  return raw;
}

function pickCommodityId(raw: string): string {
  if (raw === 'all') return 'all';
  const lower = raw.toLowerCase();
  const byId = FOOD_SAFETY_COMMODITY_IDS.find((id) => id.toLowerCase() === lower);
  if (byId) return byId;
  // guard hasOwnProperty: กัน key จำพวก constructor/__proto__ แล่นผ่าน prototype chain ของ Record
  const byThaiName = Object.prototype.hasOwnProperty.call(FOOD_SAFETY_COMMODITY_NAME_ALIASES, raw)
    ? FOOD_SAFETY_COMMODITY_NAME_ALIASES[raw]
    : undefined;
  if (byThaiName) return byThaiName;
  throw new HubRequestError(
    400,
    'INVALID_QUERY',
    `ไม่พบรหัสสินค้า "${raw}" — ใช้ได้เฉพาะ ${ACCEPTED_COMMODITIES} (หรือชื่อสินค้าภาษาไทย เช่น ทุเรียน, ข้าว) หรือ all`,
  );
}

/**
 * GET /api/v1/food-safety
 *
 * มาตรฐานความปลอดภัยสินค้าเกษตรและการตรวจสอบย้อนกลับ (Food Safety & Traceability)
 * คืนกระดานการรับรองตามมาตรฐาน, ยอดตรวจสารตกค้าง, ทะเบียนใบรับรอง และเส้นทางการตรวจสอบย้อนกลับแบบ QR
 *
 * พารามิเตอร์ (ทุกค่าไม่บังคับ, ไม่ระบุ = 'all'):
 * - provinceCode = รหัสจังหวัด 2 หลักตามตาราง 77 จังหวัด (เช่น 10, 22, 57, 96) หรือ 'all'
 * - region = north | northeast | central | east | south หรือคำไทย (เหนือ, อีสาน, กลาง, ตะวันออก, ใต้) หรือ 'all'
 * - standardId = gap_crop | gap_livestock | gap_fishery | organic_thailand | chemical_residue
 *   (alias: gap, livestock, fishery, aquaculture, organic, mrl, อินทรีย์, สารตกค้าง) หรือ 'all'
 * - mandateType = mandatory | voluntary (alias: บังคับ, สมัครใจ) หรือ 'all'
 * - commodityId = รหัสสินค้าใน FOOD_SAFETY_COMMODITY_IDS หรือชื่อสินค้าภาษาไทย (เช่น ทุเรียน, ข้าว) หรือ 'all'
 * - search = ข้อความไม่เกิน 100 ตัวอักษร ใช้เลขใบรับรอง, lotCode, farmCode, ชื่อจังหวัด หรือชื่อผู้ถือใบรับรอง
 *
 * ข้อตกลงกับผู้ใช้:
 * - data.sample = true เสมอ — ตัวเลขทั้งหมดเป็นชุดตัวอย่าง deterministic ไม่ใช่สถิติทางการที่ผ่านการทวนสอบ
 * - meta.access = "metadata_only" — สิทธิ์เผยแพร่ตัวเลขจริงของแหล่งราชการยัง pending
 * - provinceStats มีครบ 77 แถวเมื่อไม่กรองพื้นที่ (meta.completeness = complete) ส่วนตัวกรองรายสินค้า
 *   จะสลับแถวจังหวัดเป็น grain ของสินค้านั้น ซึ่ง meta.completeness จะกลายเป็น partial ตามจำนวนแถวจริง
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const provinceCode = pickProvinceCode(readToken(url, 'provinceCode', 20));
    const region = pickEnum(readToken(url, 'region', 40), 'region', REGION_ALIASES, ACCEPTED_REGIONS);
    const standardId = pickEnum(readToken(url, 'standardId', 40), 'standardId', STANDARD_ALIASES, ACCEPTED_STANDARDS);
    const mandateType = pickEnum(readToken(url, 'mandateType', 30), 'mandateType', MANDATE_ALIASES, ACCEPTED_MANDATES);
    const commodityId = pickCommodityId(readToken(url, 'commodityId', 60));
    const search = parseText(url, 'search', 100);

    const filters: FoodSafetyFilters = { provinceCode, region, standardId, mandateType, commodityId, search };
    const payload = buildFoodSafetyDashboard(filters);

    // completeness วัดจาก "แถวจังหวัดครบทั้งตารางอ้างอิงหรือไม่" เท่านั้น ไม่ใช่ความครบถ้วนของแหล่งข้อมูลจริง
    const allProvincesPresent = payload.provinceStats.length === FOOD_SAFETY_PROVINCE_CODES.size;

    return jsonData(payload, {
      meta: {
        availability: 'ready',
        // ชุดข้อมูล regenerate แบบ deterministic ที่ as-of คงที่จึงไม่มีความหมายถึงการ refresh ล่าสุด
        freshness: 'fresh',
        completeness: allProvincesPresent ? 'complete' : 'partial',
        access: 'metadata_only',
        sourceIds: payload.sources.map((source) => source.id),
        dataAsOf: payload.dataAsOf,
        warnings: payload.warnings,
        runtimeMode: 'database',
      },
    });
  });
}
