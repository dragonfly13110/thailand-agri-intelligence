import { handleApi, HubRequestError, jsonData, parsePositiveInt, parseText } from '../../../../lib/hub/http';
import { getLaborSnapshot, LABOR_GOVERNANCE } from '../../../../lib/hub/labor-data';
import type { AgeGroupFilter } from '../../../../lib/hub/labor-data';

export const dynamic = 'force-dynamic';

const REGION_KEYS = ['north', 'northeast', 'central', 'east', 'south'] as const;
type RegionKey = (typeof REGION_KEYS)[number];

/** คำไทยที่ยอมรับเท่ากับ 'all' เพื่อให้ผู้เรียกภาษาไทยไม่ต้องแปลงค่าเอง */
const ALL_TOKENS = new Set(['all', 'ทั้งหมด', 'ทุกจังหวัด', 'ทุกภาค', 'ทุกช่วงอายุ']);

const REGION_ALIASES = new Map<string, RegionKey>([
  ['north', 'north'],
  ['เหนือ', 'north'],
  ['ภาคเหนือ', 'north'],
  ['northeast', 'northeast'],
  ['อีสาน', 'northeast'],
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

/** ลำดับต้องตรงกับ AgeGroupFilter ของ labor-data เพื่อใช้ทั้งตรวจค่าและข้อความรายการที่รับได้ */
const AGE_GROUPS: readonly AgeGroupFilter[] = [
  'all',
  'young',
  'senior',
  '15_24',
  '25_34',
  '35_44',
  '45_54',
  '55_59',
  '60_64',
  '65_plus',
];

const LITE_WARNING =
  'การตอบกลับโหมด lite (ไม่ได้ส่ง detail=1) ตัด array ageBands[] ออกจากทุกรายการจังหวัด '
  + 'ตัวเลขสรุประดับประเทศ ภาค และดัชนีเชิงโครงสร้างยังคงครบถ้วน หากต้องการช่วงอายุรายจังหวัดให้เพิ่ม detail=1';

/** โครง response จริงของ route นี้: โหมด lite ตัด ageBands[] ออกจากรายการจังหวัด */
type LaborSnapshot = Awaited<ReturnType<typeof getLaborSnapshot>>;
type LaborProvince = LaborSnapshot['provinces'][number];
type LiteLaborProvince = Omit<LaborProvince, 'ageBands'>;
type RouteData = Omit<LaborSnapshot, 'provinces' | 'warnings'> & {
  provinces: LaborProvince[] | LiteLaborProvince[];
  warnings: string[];
};

const ACCEPTED_REGIONS = REGION_KEYS.join(', ');

function pickProvinceCode(raw: string): string | null {
  if (!raw || ALL_TOKENS.has(raw.toLowerCase())) return null;
  if (!/^\d{2}$/.test(raw)) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      'รหัสจังหวัดไม่ถูกต้อง: ' + raw + ' (ต้องเป็นรหัส 2 หลักในทะเบียน 77 จังหวัด หรือ all)',
    );
  }
  return raw;
}

function pickRegion(raw: string): RegionKey | null {
  if (!raw || ALL_TOKENS.has(raw.toLowerCase())) return null;
  const mapped = REGION_ALIASES.get(raw.toLowerCase()) ?? REGION_ALIASES.get(raw.normalize('NFC').trim());
  if (!mapped) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      'พารามิเตอร์ region ค่า "' + raw + '" ไม่รู้จัก — ใช้ได้เฉพาะ ' + ACCEPTED_REGIONS + ' หรือ all',
    );
  }
  return mapped;
}

function pickAgeGroup(raw: string): AgeGroupFilter {
  if (!raw || ALL_TOKENS.has(raw.toLowerCase())) return 'all';
  const matched = AGE_GROUPS.find((group) => group === raw.toLowerCase());
  if (!matched) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      'พารามิเตอร์ ageGroup ค่า "' + raw + '" ไม่รู้จัก — ใช้ได้เฉพาะ ' + AGE_GROUPS.join(', '),
    );
  }
  return matched;
}

/**
 * GET /api/v1/labor
 *
 * แรงงานเกษตรและดัชนีเกษตรกรสูงวัย (Agricultural Labor & Aging Farmer Index)
 * สำหรับหน้า /labor — ครอบคลุมจำนวนเกษตรกรที่ขึ้นทะเบียน ครัวเรือน กำลังแรงงานภาคเกษตร
 * ช่วงอายุ-เพศ สมาชิก Young Smart Farmer (YSF) แนวโน้มรายปี ความต้องการเทคโนโลยีทดแทนแรงงาน
 * และข้อมูลรายจังหวัด/รายภาค
 *
 * พารามิเตอร์ (ทุกตัวไม่บังคับ; ไม่ระบุหรือส่ง all = ไม่กรอง):
 * - provinceCode = รหัสจังหวัด 2 หลัก ต้องมีอยู่ในรายการ 77 จังหวัดที่ data.provinces คืนมา
 *   ค่าที่ผิดรูปแบบหรือไม่พบ → 400 INVALID_QUERY พร้อมบอกค่าที่ส่งมา (ไม่คืนรายการว่างเงียบ ๆ)
 * - region       = north | northeast | central | east | south (รับคำไทย เช่น ภาคเหนือ, อีสาน, ใต้ ด้วย)
 * - ageGroup     = all | young | senior | 15_24 | 25_34 | 35_44 | 45_54 | 55_59 | 60_64 | 65_plus
 *   เลือกเฉพาะ cohort ใน selectedAgeGroup (ageBands ยังเป็น 7 ช่วงของทั้งขอบเขต)
 *   ส่วน KPI เชิงโครงสร้าง (summary, agingFarmerIndex, regions, trend) ยังเป็นภาพรวมของขอบเขตเสมอ
 *   ไม่ถูกจำกัดด้วย cohort
 * - detail       = 1 ให้คง ageBands[] (ช่วงอายุ-เพศ) ของทุกจังหวัด; ไม่ส่ง = โหมด lite ตัด ageBands[]
 *   และแนบ warning อธิบาย
 * - limit        = จำนวนแถวจังหวัดสูงสุดหลังตรวจค่า (1-77, ค่าเริ่มต้น 77) มีผลกับ data.provinces เท่านั้น
 *   ไม่กระทบ summary/regions/trend และใช้หลังการตรวจรหัสจังหวัดแล้ว
 *
 * AFI (agingFarmerIndex): ดัชนีเกษตรกรสูงวัย = จำนวนเกษตรกรอายุ 60 ปีขึ้นไปต่อเกษตรกรอายุ 15–34 ปี
 * 100 คนในขอบเขตเดียวกัน (ไม่ใช่สัดส่วนสูงวัยต่อประชากรทั้งหมด) แปลเป็นสถานะ
 * critical | warning | watch | stable ด้วยเกณฑ์ agingFarmerIndex.benchmark (100 / 200)
 * นิยามเต็มและสมมติฐานอื่น (youngMaxAge, seniorExitRatePercent, replacementDefinition)
 * อยู่ใน data.assumptions
 *
 * Governance: getLaborSnapshot คืนชุดตัวอย่าง deterministic (sample: true) ทุกตัวเลขจึงไม่ใช่สถิติ
 * ทางการและห้ามอ้างอิงในเอกสารราชการ meta.access = 'metadata_only' เพราะสิทธิ์เผยแพร่ตัวเลขจริงของ
 * แหล่งราชการยัง pending, meta.dataAsOf = null, meta.completeness = 'partial'
 * การมี 77 แถวจังหวัดเป็นทะเบียนอ้างอิง ไม่ใช่ข้ออ้าง coverage ของข้อมูลจริง
 * generatedAt มาจาก LABOR_GOVERNANCE.updatedAt (ค่าคงที่) จึงได้ response เดิมทุกครั้งเมื่อพารามิเตอร์เดิม
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawRegion = parseText(url, 'region', 40);
    const rawAgeGroup = parseText(url, 'ageGroup', 30);
    const detailParam = parseText(url, 'detail', 4);

    const provinceCode = pickProvinceCode(rawProvince);
    const region = pickRegion(rawRegion);
    const ageGroup = pickAgeGroup(rawAgeGroup);
    const withDetail = detailParam === '1';
    const limit = parsePositiveInt(url.searchParams.get('limit'), 77, 77, 'limit');

    // สร้าง snapshot ครั้งเดียวหลังตรวจรูปแบบพารามิเตอร์ครบแล้ว; การตรวจรหัสจังหวัดต้องอ้างทะเบียน
    // 77 จังหวัดจาก snapshot จึงตรวจต่อทันทีโดยไม่เรียกซ้ำ และไม่ส่ง limit เข้าไปเพื่อไม่ให้แถวจังหวัด
    // ถูกตัดก่อนการตรวจความสอดคล้องของภาค
    const payload = await getLaborSnapshot({
      provinceCode: provinceCode ?? undefined,
      region: region ?? undefined,
      ageGroup,
      detail: withDetail,
    });

    if (provinceCode) {
      const selected = payload.provinces.find((province) => province.provinceCode === provinceCode);
      if (!selected) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบรหัสจังหวัดที่ระบุ: ' + provinceCode
            + (region ? ' ในภาค ' + region : '')
            + ' (ต้องเป็นรหัส 2 หลักในทะเบียน 77 จังหวัด'
            + (region ? ' และต้องอยู่ในภาคที่เลือกด้วย' : '')
            + ')',
        );
      }
      if (region && selected.regionKey !== region) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'จังหวัด ' + provinceCode + ' อยู่ในภาค ' + selected.regionKey + ' ไม่ตรงกับ region ที่ระบุ: ' + region,
        );
      }
    }

    const warnings = withDetail ? payload.warnings : [...payload.warnings, LITE_WARNING];
    const provincesInScope = payload.provinces.slice(0, limit);
    const responseProvinces: LaborProvince[] | LiteLaborProvince[] = withDetail
      ? provincesInScope
      : provincesInScope.map(({ ageBands, ...rest }) => {
          void ageBands;
          return rest;
        });

    const data: RouteData = {
      ...payload,
      provinces: responseProvinces,
      warnings,
    };

    return jsonData(data, {
      meta: {
        availability: 'ready',
        freshness: 'unknown',
        completeness: 'unknown',
        access: payload.access,
        sourceIds: payload.sources.map((source) => source.id),
        dataAsOf: null,
        sourceUpdatedAt: null,
        datasetVersion: LABOR_GOVERNANCE.version,
        warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
