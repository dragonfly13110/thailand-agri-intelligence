import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import { loadLddPgsEnvelope } from '../../../../lib/hub/ldd-pgs-progress';
import {
  buildLandReformData,
  buildLandReformLddPgsSection,
  buildLandReformLddPgsUnavailable,
  isLandType,
  isProvinceCode,
  isRegion,
  isTenureStatus,
  LAND_REFORM_WARNINGS,
  type LandReformLddPgsSection,
  type LandType,
  type Region,
  type TenureStatus,
} from '../../../../lib/hub/land-reform-data';

export const dynamic = 'force-dynamic';

const EMPTY_FILTER_WARNING = 'ไม่พบจังหวัดที่ตรงกับตัวกรองที่ระบุ';

/**
 * GET /api/v1/land-reform
 *
 * สองส่วน คนละสิทธิ์ คนละหน่วยงาน ในคำตอบเดียว:
 *
 * 1) `data` ด้านบน = ภาพรวมที่ดินเพื่อการเกษตรและการถือครอง (ALRO ส.ป.ก.)
 *    แบบ deterministic simulation ทุกตัวเลขยัง เป็น sample (`sample: true`) และสิทธิ์เผยแพร่
 *    ข้อมูลจริงของ ส.ป.ก. ยังอยู่ระหว่างการยืนยัน จึงคืนเฉพาะ metadata
 *    (`access: metadata_only`) ไม่เรียกเครือข่ายภายนอก ไม่อ่านฐานข้อมูลของส่วนนี้
 * 2) `data.lddPgs` = ส่วนข้อมูลจริงจากกรมพัฒนาที่ดิน (LDD) ของทรัพยากรที่อนุมัติแล้ว
 *    `ldd_pgs_program_progress` (resource_id 2feb3230-cf86-4560-95f5-93e58270a7d8, dataset ord02)
 *    ประกาศ `sample: false` เฉพาะบล็อกนี้ อ่านจากคลังข้อมูลกลางตามเกรนต้นทาง
 *    (หน่วยงานผู้รายงาน × ปีงบประมาณ พ.ศ. × ประเภทกลุ่ม × คอลัมน์ที่เผยแพร่)
 *    - ไม่คำนวณร้อยละความก้าวหน้า ไม่เฉลี่ย ไม่บวกข้ามปี/ข้ามหน่วยงาน/ข้ามหน่วย
 *      (สัญญาอนุญาต CC BY-NC-ND ห้ามดัดแปลง — derivation_allowed = false)
 *    - meta.dataAsOf ของบล็อกนี้เป็น null เสมอ เพราะต้นทางไม่เผยแพร่วันตัดยอด
 *    - ค่าที่ต้นทางไม่กรอกคงเป็น null และหน่วยที่ไม่ยืนยันแสดงเป็น null + "ไม่ระบุ"
 *    - ทรัพยากร `ldd_rice_zoning_provincial` ยัง `pending` จึงไม่ถูกอ่าน ไม่ถูกแสดง
 *      และไม่ปรากฏในคำตอบนี้ในทุกกรณี
 *    - คลังว่าง/อ่านไม่สำเร็จ → `lddPgs.availability` = empty | metadata_only | unavailable
 *      พร้อมเหตุผลใน `notAvailableReason` และไม่มีการดึงตัวเลขจำลองของส่วนที่ 1 มาแทน
 *
 * `meta.availability` / `meta.access` ระดับบนอธิบายเฉพาะพื้นผิวส่วน ALRO (metadata_only)
 * ส่วนของ LDD PGS มี `availability` / `access` / `warnings` ของตัวเองใน `data.lddPgs`
 *
 * พารามิเตอร์ (ใช้กับส่วน ALRO simulation เท่านั้น):
 * - provinceCode = รหัสจังหวัด 2 หลักในชุด 77 จังหวัด (จังหวัดที่ไม่มีพื้นที่ =
 *   valid 200 ที่มีแถวศูนย์และเหตุผล ไม่ใช่ error)
 * - landType = sor_por_kor_4_01 | agricultural_title_deed | rented_land
 * - tenureStatus = owner_secure | owner_insecure | mixed | tenant
 * - region = หนึ่งใน 6 ภาคของชุดข้อมูล
 * - q = คำค้นชื่อจังหวัด/รหัส สูงสุด 120 ตัวอักษร
 *
 * ไม่มี pagination เพราะชุดข้อมูลส่วน ALRO มีสูงสุด 77 แถว (ชุด LDD PGS ส่งครบตามจำนวนที่อ่านได้)
 */
export async function GET(request: Request) {
  return handleApi(async () => {
    const url = new URL(request.url);

    const rawProvinceCode = parseText(url, 'provinceCode', 10);
    const rawLandType = parseText(url, 'landType', 40);
    const rawTenureStatus = parseText(url, 'tenureStatus', 40);
    const rawRegion = parseText(url, 'region', 40);
    const q = parseText(url, 'q', 120) || undefined;

    const provinceCode = rawProvinceCode || undefined;
    if (provinceCode !== undefined && (!/^\d{2}$/.test(provinceCode) || !isProvinceCode(provinceCode))) {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'รหัสจังหวัดไม่ถูกต้อง: ต้องเป็นรหัส 2 หลักในชุด 77 จังหวัด'
      );
    }

    let landType: LandType | undefined;
    if (rawLandType) {
      if (!isLandType(rawLandType)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ประเภทเอกสารสิทธิ์ไม่ถูกต้อง (รองรับ sor_por_kor_4_01, agricultural_title_deed, rented_land)'
        );
      }
      landType = rawLandType;
    }

    let tenureStatus: TenureStatus | undefined;
    if (rawTenureStatus) {
      if (!isTenureStatus(rawTenureStatus)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'สถานะการถือครองที่ดินไม่ถูกต้อง (รองรับ owner_secure, owner_insecure, mixed, tenant)'
        );
      }
      tenureStatus = rawTenureStatus;
    }

    let region: Region | undefined;
    if (rawRegion) {
      if (!isRegion(rawRegion)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ภาคไม่ถูกต้อง (รองรับ 6 ภาคตามชุดข้อมูล)'
        );
      }
      region = rawRegion;
    }

    const dataset = buildLandReformData({ provinceCode, landType, tenureStatus, region, q });
    const empty = dataset.provinces.length === 0;

    // ส่วนข้อมูลจริง LDD PGS: อ่านจากคลังกลางที่ gate สิทธิ์ระดับทรัพยากรอยู่แล้ว
    // ถ้าไม่สำเร็จได้สถานะ unavailable พร้อมเหตุผล — ไม่มีเส้นทาง nàoตกกลับไปใช้ตัวเลขจำลอง
    let lddPgs: LandReformLddPgsSection;
    try {
      lddPgs = buildLandReformLddPgsSection(await loadLddPgsEnvelope());
    } catch (error) {
      lddPgs = buildLandReformLddPgsUnavailable(
        error instanceof HubRequestError ? error.code : 'LDD_PGS_DATA_UNAVAILABLE',
      );
    }

    const lddWarnings = lddPgs.warnings
      .filter(warning => !warning.startsWith('LDD PGS:'))
      .map(warning => `LDD PGS: ${warning}`);

    return jsonData(
      { ...dataset, sample: true, lddPgs },
      {
        meta: {
          availability: 'metadata_only',
          freshness: 'unknown',
          completeness: 'unknown',
          access: 'metadata_only',
          sourceIds: ['alro-land-simulation', 'ldd'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: dataset.datasetVersion,
          warnings: [
            ...(empty ? [...LAND_REFORM_WARNINGS, EMPTY_FILTER_WARNING] : [...LAND_REFORM_WARNINGS]),
            'meta.availability/access/runtimeMode ระดับบนอธิบายเฉพาะพื้นผิวส่วน ALRO (sample = true, ไม่อ่านคลัง) — '
              + 'ส่วนของกรมพัฒนาที่ดินซึ่งอ่านจากคลังข้อมูลกลางดูที่ data.lddPgs.availability / access (sample = false)',
            ...lddWarnings,
          ],
          runtimeMode: 'source_api_fallback',
        },
      }
    );
  });
}
