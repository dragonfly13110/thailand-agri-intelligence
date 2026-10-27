import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildCarbonDashboard,
  CARBON_PROVINCES,
  normalizeCarbonProjectType,
} from '../../../../lib/hub/carbon-data';

export const dynamic = 'force-dynamic';

const VALID_PROVINCE_CODES = new Set(CARBON_PROVINCES.map((province) => province.code));

/**
 * GET /api/v1/carbon
 *
 * ศักยภาพการกักเก็บคาร์บอนภาคเกษตร สถิติโครงการ T-VER ภาคเกษตรและป่าไม้
 * และการวิเคราะห์นาเปียกสลับแห้ง (AWD)
 *
 * พารามิเตอร์:
 * - provinceCode = รหัสจังหวัด 2 หลัก (10-96) หรือ 'all'
 * - projectType = perennial_tree | rubber | oil_palm | soil | awd หรือ 'all'
 *
 * หมายเหตุ: ข้อมูลทั้งหมดเป็น deterministic sample (sample: true) และ
 * สิทธิ์เผยแพร่ตัวเลขจริงยังไม่ผ่านการยืนยัน (meta.access = metadata_only)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawProjectType = parseText(url, 'projectType', 60);

    let provinceCode: string | undefined;
    if (rawProvince && rawProvince !== 'all') {
      if (!VALID_PROVINCE_CODES.has(rawProvince)) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบรหัสจังหวัดที่ระบุ: ' + rawProvince);
      }
      provinceCode = rawProvince;
    }

    let projectType: ReturnType<typeof normalizeCarbonProjectType> = 'all';
    if (rawProjectType && rawProjectType !== 'all') {
      const mapped = normalizeCarbonProjectType(rawProjectType);
      if (!mapped) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบประเภทโครงการที่ระบุ: ' +
            rawProjectType +
            ' (รองรับ perennial_tree, rubber, oil_palm, soil, awd)'
        );
      }
      projectType = mapped;
    }

    const payload = buildCarbonDashboard({ provinceCode, projectType });

    return jsonData(payload, {
      meta: {
        availability: 'ready',
        freshness: 'unknown',
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: ['tgo', 'ldd', 'doae', 'oae'],
        dataAsOf: null,
        warnings: payload.warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
