import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  ACTIVITY_IDS,
  ACTIVITY_LABELS,
  AGRI_TOURISM_PROVINCE_CODES,
  AGRI_TOURISM_PROVINCES,
  buildAgriTourismDashboard,
  REGION_LABEL_BY_KEY,
  type ActivityId,
  type AgriTourismFilters,
  type RegionKey,
} from '../../../../lib/hub/agri-tourism-data';

export const dynamic = 'force-dynamic';

/* ทุกค่าที่ตรงกับ all-tokens หมายถึง "ไม่กรอง" เพื่อให้ทั้ง API และผู้ใช้ไทยพิมพ์สลับกันได้ */
const ALL_TOKENS = new Set(['all', 'ทั้งหมด', 'ทุกจังหวัด', 'ทุกภาค', 'ทุกกิจกรรม', 'ทุกเดือน']);

const REGION_KEYS = ['north', 'northeast', 'central', 'east', 'south'] as const;

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

/** alias กิจกรรมเขียนตายตัวตาม ACTIVITY_LABELS — ไม่ derive อัตโนมัติเพื่อไม่ให้คำไทยกว้างเกินเจตนา */
const ACTIVITY_ALIASES = new Map<string, ActivityId>([
  ['farmstay', 'farmstay'],
  ['ฟาร์มสเตย์', 'farmstay'],
  ['learning_center', 'learning_center'],
  ['ศูนย์เรียนรู้', 'learning_center'],
  ['royal_initiative', 'royal_initiative'],
  ['ตามรอยศาสตร์พระราชา', 'royal_initiative'],
  ['ศาสตร์พระราชา', 'royal_initiative'],
  ['fruit_festival', 'fruit_festival'],
  ['เทศกาลผลไม้', 'fruit_festival'],
  ['festival', 'fruit_festival'],
  ['workshop', 'workshop'],
  ['เวิร์กชอป', 'workshop'],
  ['เวิร์คช็อป', 'workshop'],
  ['อบรม', 'workshop'],
  ['community_enterprise', 'community_enterprise'],
  ['วิสาหกิจชุมชน', 'community_enterprise'],
  ['วิสาหกิจ', 'community_enterprise'],
  ['large_scale_group', 'large_scale_group'],
  ['แปลงใหญ่', 'large_scale_group'],
  ['กลุ่มแปลงใหญ่', 'large_scale_group'],
  ['otop_market', 'otop_market'],
  ['otop', 'otop_market'],
  ['ตลาดชุมชน', 'otop_market'],
  ['ตลาดโอท็อป', 'otop_market'],
]);

const THAI_MONTH_NAMES = new Map<string, number>([
  ['ม.ค.', 1], ['ม.ค', 1], ['มกราคม', 1],
  ['ก.พ.', 2], ['ก.พ', 2], ['กุมภาพันธ์', 2],
  ['มี.ค.', 3], ['มี.ค', 3], ['มีนาคม', 3],
  ['เม.ย.', 4], ['เม.ย', 4], ['เมษายน', 4],
  ['พ.ค.', 5], ['พ.ค', 5], ['พฤษภาคม', 5],
  ['มิ.ย.', 6], ['มิ.ย', 6], ['มิถุนายน', 6],
  ['ก.ค.', 7], ['ก.ค', 7], ['กรกฎาคม', 7],
  ['ส.ค.', 8], ['ส.ค', 8], ['สิงหาคม', 8],
  ['ก.ย.', 9], ['ก.ย', 9], ['กันยายน', 9],
  ['ต.ค.', 10], ['ต.ค', 10], ['ตุลาคม', 10],
  ['พ.ย.', 11], ['พ.ย', 11], ['พฤศจิกายน', 11],
  ['ธ.ค.', 12], ['ธ.ค', 12], ['ธันวาคม', 12],
]);

/** ทะเบียนชื่อจังหวัดภาษาไทย → รหัส 2 หลัก (กัน lookup พ้น prototype chain ด้วย Map ไม่ใช่ Record) */
const PROVINCE_NAME_ALIASES = new Map<string, string>();
for (const province of AGRI_TOURISM_PROVINCES) {
  const registerName = (value: string) => {
    const trimmed = value.normalize('NFC').trim();
    if (!trimmed) return;
    PROVINCE_NAME_ALIASES.set(trimmed, province.code);
    if (trimmed.startsWith('จังหวัด')) {
      const bare = trimmed.slice('จังหวัด'.length).trim();
      if (bare) PROVINCE_NAME_ALIASES.set(bare, province.code);
    }
  };
  registerName(province.name);
}

const ACCEPTED_REGIONS = REGION_KEYS.map((key) => `${key} (${REGION_LABEL_BY_KEY[key]})`).join(', ');
const ACCEPTED_ACTIVITIES = ACTIVITY_IDS.map((id) => `${id} (${ACTIVITY_LABELS[id]})`).join(', ');

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

/** รับรหัสจังหวัด 2 หลัก หรือชื่อจังหวัดภาษาไทย (เช่น เชียงใหม่ / จังหวัดเชียงใหม่) แล้ว resolve เป็นรหัส */
function pickProvinceCode(raw: string): string {
  if (raw === 'all') return 'all';
  if (/^\d{2}$/.test(raw)) {
    if (AGRI_TOURISM_PROVINCE_CODES.has(raw)) return raw;
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      `ไม่พบรหัสจังหวัด "${raw}" — ต้องเป็นรหัส 2 หลักในทะเบียนจังหวัดอ้างอิง 77 จังหวัดของ Data Hub (เช่น 10, 20, 50, 80) หรือ all`,
    );
  }
  const normalizedName = raw.normalize('NFC').trim();
  const bareName = normalizedName.startsWith('จังหวัด')
    ? normalizedName.slice('จังหวัด'.length).trim()
    : normalizedName;
  const byName = PROVINCE_NAME_ALIASES.get(normalizedName) ?? PROVINCE_NAME_ALIASES.get(bareName);
  if (byName) return byName;
  throw new HubRequestError(
    400,
    'INVALID_QUERY',
    `ไม่พบจังหวัด "${raw}" — ใช้รหัสจังหวัด 2 หลักตามทะเบียนอ้างอิง 77 จังหวัด หรือชื่อจังหวัดภาษาไทย (เช่น เชียงใหม่, จังหวัดเชียงใหม่) หรือ all`,
  );
}

/** เดือน 1-12 รับทั้งเลข (1..12, 01..12) และชื่อ/ชื่อย่อภาษาไทย — ค่าอื่น 400 พร้อมบอกขอบเขตเป็นไทย */
function pickMonth(raw: string): number | 'all' {
  if (raw === 'all') return 'all';
  if (/^\d{1,2}$/.test(raw)) {
    const value = Number(raw);
    if (value >= 1 && value <= 12) return value;
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      `พารามิเตอร์ month ค่า "${raw}" ไม่ถูกต้อง — ต้องเป็นเลข 1 ถึง 12 (หรือชื่อเดือน เช่น มกราคม, ธ.ค.) หรือ all`,
    );
  }
  const byName = THAI_MONTH_NAMES.get(raw.normalize('NFC'));
  if (byName) return byName;
  throw new HubRequestError(
    400,
    'INVALID_QUERY',
    `พารามิเตอร์ month ค่า "${raw}" ไม่ถูกต้อง — ต้องเป็นเลข 1 ถึง 12 (หรือชื่อเดือน เช่น มกราคม, ธ.ค.) หรือ all`,
  );
}

/**
 * GET /api/v1/agri-tourism
 *
 * การท่องเที่ยวเชิงเกษตรและวิสาหกิจชุมชนแปลงใหญ่ (Agri-Tourism & Community Enterprises)
 * คืนแหล่งท่องเที่ยวเชิงเกษตรตามจังหวัด/ภาค, ปฏิทินผลไม้-เทศกาล, หลักสูตรอบรม,
 * วิสาหกิจชุมชน/กลุ่มแปลงใหญ่/ตลาด OTOP และคำแนะนำการเดินทางตามฤดูกาล
 *
 * พารามิเตอร์ (ทุกค่าไม่บังคับ, ไม่ระบุ = 'all'; ถ้าส่งพารามิเตอร์ซ้ำ รับค่าแรกเท่านั้นตาม url.searchParams.get):
 * - provinceCode = รหัสจังหวัด 2 หลักตามทะเบียนอ้างอิง 77 จังหวัด (เช่น 10, 20, 50) หรือชื่อจังหวัด
 *   ภาษาไทย (เชียงใหม่ / จังหวัดเชียงใหม่) หรือ 'all' (ทั้งหมด, ทุกจังหวัด)
 * - region = north | northeast | central | east | south หรือคำไทย
 *   (เหนือ, อีสาน,ตะวันออกเฉียงเหนือ, กลาง, ตะวันออก, ใต้ พร้อมนำหน้า 'ภาค' ได้) หรือ 'all' (ทุกภาค)
 * - activity = farmstay | learning_center | royal_initiative | fruit_festival | workshop
 *   | community_enterprise | large_scale_group | otop_market
 *   (alias: ฟาร์มสเตย์, ศูนย์เรียนรู้, ตามรอยศาสตร์พระราชา, เทศกาลผลไม้, เวิร์กชอป, วิสาหกิจชุมชน,
 *   แปลงใหญ่, ตลาดชุมชน, OTOP) หรือ 'all' (ทุกกิจกรรม)
 * - month = 1-12, 01-12 หรือชื่อ/ชื่อย่อเดือนไทย (มกราคม..ธันวาคม, ม.ค. .. ธ.ค.) หรือ 'all' (ทุกเดือน)
 * - search = ข้อความไม่เกิน 100 ตัวอักษร จับคู่ชื่อแหล่งท่องเที่ยว วิสาหกิจชุมชน สินค้า และคำอธิบาย
 *
 * ข้อตกลงกำกับข้อมูล:
 * - data.sample = true เสมอ — ตัวเลขทั้งหมดเป็นชุดตัวอย่าง deterministic ไม่ใช่สถิติทางการ
 * - meta.access = "metadata_only" — สิทธิ์เผยแพร่ตัวเลขจริงของแหล่งราชการยัง pending
 * - ทะเบียนจังหวัด 77 แถวเป็น reference register ไม่ใช่ข้ออ้าง coverage; ตัวเลขห้ามอ้างอิงในเอกสารราชการ
 * - meta.freshness/dataAsOf/completeness ไม่อ้างวันที่หรือ coverage ของ source จริง
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const provinceCode = pickProvinceCode(readToken(url, 'provinceCode', 60));
    const region = pickEnum(readToken(url, 'region', 40), 'region', REGION_ALIASES, ACCEPTED_REGIONS);
    const activity = pickEnum(readToken(url, 'activity', 40), 'activity', ACTIVITY_ALIASES, ACCEPTED_ACTIVITIES);
    const month = pickMonth(readToken(url, 'month', 20));
    const search = parseText(url, 'search', 100);

    const filters: AgriTourismFilters = { provinceCode, region, activity, month, search };
    const payload = buildAgriTourismDashboard(filters);

    return jsonData(payload, {
      meta: {
        availability: 'ready',
        freshness: 'unknown',
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: payload.sources.map((source) => source.id),
        dataAsOf: null,
        warnings: payload.warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
