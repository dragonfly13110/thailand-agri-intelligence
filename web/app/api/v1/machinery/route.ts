import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  MACHINERY_PROVINCES,
  SERVICE_CENTER_KIND_IDS,
  buildMachineryDashboard,
  type MachineryType,
  type ServiceCenterKind,
} from '../../../../lib/hub/machinery-data';

export const dynamic = 'force-dynamic';

const VALID_PROVINCE_CODES = new Set(MACHINERY_PROVINCES.map((province) => province.code));

const MACHINERY_TYPE_ALIASES: Record<string, MachineryType> = {
  tractor: 'tractor',
  'รถแทรกเตอร์': 'tractor',
  'แทรกเตอร์': 'tractor',
  combine_harvester: 'combine_harvester',
  combine: 'combine_harvester',
  harvester: 'combine_harvester',
  'รถเกี่ยวนวดข้าว': 'combine_harvester',
  'รถเกี่ยวนวด': 'combine_harvester',
  'รถเกี่ยวข้าว': 'combine_harvester',
  transplanter: 'transplanter',
  rice_transplanter: 'transplanter',
  'รถดำนา': 'transplanter',
  'ดำนา': 'transplanter',
  drone: 'drone',
  agricultural_drone: 'drone',
  'โดรน': 'drone',
  'โดรนการเกษตร': 'drone',
  'โดรนพ่นยา': 'drone',
};

const CENTER_KIND_ALIASES: Record<string, ServiceCenterKind> = {
  custom_hiring: 'custom_hiring',
  'ศูนย์จ้างเหมา': 'custom_hiring',
  'จ้างเหมา': 'custom_hiring',
  mechanic: 'mechanic',
  'ศูนย์บริการช่าง': 'mechanic',
  'ช่าง': 'mechanic',
  large_field_group: 'large_field_group',
  'กลุ่มแปลงใหญ่': 'large_field_group',
};

/**
 * GET /api/v1/machinery
 *
 * ภาพรวมเครื่องจักรกลการเกษตร ค่าเช่าเฉลี่ย ความเพียงพอช่วงเก็บเกี่ยว
 * และศูนย์จ้างเหมา/ศูนย์บริการช่าง/กลุ่มแปลงใหญ่รายจังหวัด
 *
 * พารามิเตอร์:
 * - provinceCode = รหัสจังหวัด 2 หลัก (10-96) หรือ 'all'
 * - machineryType = tractor | combine_harvester | transplanter | drone หรือ 'all'
 * - centerKind = custom_hiring | mechanic | large_field_group หรือ 'all'
 * - search = คำค้นหาชื่อศูนย์ จังหวัด อำเภอ ผู้ให้บริการ ประเภทเครื่องจักร
 *
 * ข้อกำหนด:
 * - ข้อมูลเป็น deterministic sample: sample true และ meta.access metadata_only
 * - ค่าเช่าเป็นค่ากลางจำลอง ไม่ใช่ราคาประกาศของผู้ประกอบการ
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawMachineryType = parseText(url, 'machineryType', 40);
    const rawCenterKind = parseText(url, 'centerKind', 40);
    const search = parseText(url, 'search', 100);

    let provinceCode: string | undefined;
    if (rawProvince && rawProvince !== 'all') {
      if (!VALID_PROVINCE_CODES.has(rawProvince)) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบรหัสจังหวัดที่ระบุ: ' + rawProvince);
      }
      provinceCode = rawProvince;
    }

    let machineryType: MachineryType | undefined;
    if (rawMachineryType && rawMachineryType !== 'all') {
      const mapped =
        MACHINERY_TYPE_ALIASES[rawMachineryType.toLowerCase()] ?? MACHINERY_TYPE_ALIASES[rawMachineryType];
      if (!mapped) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบประเภทเครื่องจักรที่ระบุ: '
            + rawMachineryType
            + ' (รองรับ tractor, combine_harvester, transplanter, drone)',
        );
      }
      machineryType = mapped;
    }

    let centerKind: ServiceCenterKind | undefined;
    if (rawCenterKind && rawCenterKind !== 'all') {
      const mapped =
        CENTER_KIND_ALIASES[rawCenterKind.toLowerCase()] ?? CENTER_KIND_ALIASES[rawCenterKind];
      if (!mapped || !SERVICE_CENTER_KIND_IDS.includes(mapped)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบประเภทศูนย์บริการที่ระบุ: '
            + rawCenterKind
            + ' (รองรับ custom_hiring, mechanic, large_field_group)',
        );
      }
      centerKind = mapped;
    }

    const payload = buildMachineryDashboard({
      provinceCode,
      machineryType,
      centerKind,
      search: search || undefined,
    });

    return jsonData(payload, {
      meta: {
        availability: 'ready',
        freshness: 'unknown',
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: ['doae', 'oae', 'tama'],
        dataAsOf: null,
        datasetVersion: 'machinery-sample-2026-10-25-v1',
        warnings: payload.warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
