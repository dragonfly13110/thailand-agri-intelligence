import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildLandReformData,
  isLandType,
  isProvinceCode,
  isRegion,
  isTenureStatus,
  LAND_REFORM_WARNINGS,
  type LandType,
  type Region,
  type TenureStatus,
} from '../../../../lib/hub/land-reform-data';

export const dynamic = 'force-dynamic';

const EMPTY_FILTER_WARNING = 'ไม่พบจังหวัดที่ตรงกับตัวกรองที่ระบุ';

/**
 * GET /api/v1/land-reform
 *
 * ภาพรวมที่ดินเพื่อการเกษตรและการถือครอง (ALRO) แบบ deterministic simulation
 * ทุกตัวเลขเป็น sample (`sample: true`) และสิทธิ์เผยแพร่ข้อมูลจริงของ ส.ป.ก.
 * ยังอยู่ระหว่างการยืนยัน จึงคืนเฉพาะ metadata (`access: metadata_only`)
 * ไม่เรียกเครือข่ายภายนอก ไม่อ่านฐานข้อมูล และไม่แคชผลลัพธ์
 *
 * พารามิเตอร์:
 * - provinceCode = รหัสจังหวัด 2 หลักในชุด 77 จังหวัด (จังหวัดที่ไม่มีพื้นที่ =
 *   valid 200 ที่มีแถวศูนย์และเหตุผล ไม่ใช่ error)
 * - landType = sor_por_kor_4_01 | agricultural_title_deed | rented_land
 * - tenureStatus = owner_secure | owner_insecure | mixed | tenant
 * - region = หนึ่งใน 6 ภาคของชุดข้อมูล
 * - q = คำค้นชื่อจังหวัด/รหัส สูงสุด 120 ตัวอักษร
 *
 * ไม่มี pagination เพราะชุดข้อมูลมีสูงสุด 77 แถว
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

    return jsonData(
      { ...dataset, sample: true },
      {
        meta: {
          availability: 'metadata_only',
          freshness: 'unknown',
          completeness: 'unknown',
          access: 'metadata_only',
          sourceIds: ['alro-land-simulation'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: dataset.datasetVersion,
          warnings: empty ? [...LAND_REFORM_WARNINGS, EMPTY_FILTER_WARNING] : [...LAND_REFORM_WARNINGS],
          runtimeMode: 'source_api_fallback',
        },
      }
    );
  });
}
