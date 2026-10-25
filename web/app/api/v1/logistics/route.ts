import { handleApi, HubRequestError, jsonData, parseText, parsePositiveInt } from '../../../../lib/hub/http';
import {
  buildLogisticsDashboard,
  THAILAND_PROVINCES,
  type FacilityType,
  type FacilityStatus,
} from '../../../../lib/hub/logistics-data';

export const dynamic = 'force-dynamic';

const VALID_PROVINCE_CODES = new Set(THAILAND_PROVINCES.map((p) => p.code));

const FACILITY_TYPE_ALIASES: Record<string, FacilityType> = {
  silo: 'silo',
  grain_silo: 'silo',
  ไซโล: 'silo',
  ไซโลอบแห้ง: 'silo',
  cold_storage: 'cold_storage',
  cold_chain: 'cold_storage',
  ห้องเย็น: 'cold_storage',
  'ห้องเย็นผลไม้/เนื้อสัตว์': 'cold_storage',
  general_warehouse: 'general_warehouse',
  warehouse: 'general_warehouse',
  โกดัง: 'general_warehouse',
  โกดังสินค้าเกษตรทั่วไป: 'general_warehouse',
};

const VALID_STATUSES: Record<string, FacilityStatus> = {
  operational: 'operational',
  เปิดบริการ: 'operational',
  maintenance: 'maintenance',
  ซ่อมบำรุง: 'maintenance',
  full: 'full',
  ความจุเต็ม: 'full',
};

/**
 * GET /api/v1/logistics
 *
 * ข้อมูลโครงสร้างพื้นฐานโลจิสติกส์การเกษตร ไซโล คลังสินค้า และห้องเย็น (Cold Chain)
 * พร้อมดัชนีระยะห่างจากแหล่งผลิตถึงจุดรวบรวม (Farm-to-Storage Connectivity Score)
 *
 * พารามิเตอร์:
 * - provinceCode = รหัสจังหวัด 2 หลัก (10-96) หรือ 'all'
 * - facilityType = silo | cold_storage | general_warehouse หรือ 'all'
 * - status = operational | maintenance | full หรือ 'all'
 * - minCapacity = ความจุขั้นต่ำ (ตัน)
 * - maxCapacity = ความจุสูงสุด (ตัน)
 * - search = คำค้นหา (ชื่อคลัง, อำเภอ, จังหวัด, ผู้ประกอบการ, สินค้า)
 *
 * ข้อกำหนด:
 * - ติด flag sample: true ใน data
 * - ติด flag access: "metadata_only" ใน meta
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawFacilityType = parseText(url, 'facilityType', 40);
    const rawStatus = parseText(url, 'status', 30);
    const search = parseText(url, 'search', 100);

    let provinceCode: string | undefined;
    if (rawProvince && rawProvince !== 'all') {
      if (!VALID_PROVINCE_CODES.has(rawProvince)) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบรหัสจังหวัดที่ระบุ: ' + rawProvince);
      }
      provinceCode = rawProvince;
    }

    let facilityType: FacilityType | undefined;
    if (rawFacilityType && rawFacilityType !== 'all') {
      const mapped = FACILITY_TYPE_ALIASES[rawFacilityType.toLowerCase()] || FACILITY_TYPE_ALIASES[rawFacilityType];
      if (!mapped) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบประเภทคลังสินค้าที่ระบุ: ' + rawFacilityType + ' (รองรับ silo, cold_storage, general_warehouse)'
        );
      }
      facilityType = mapped;
    }

    let status: FacilityStatus | undefined;
    if (rawStatus && rawStatus !== 'all') {
      const mapped = VALID_STATUSES[rawStatus.toLowerCase()] || VALID_STATUSES[rawStatus];
      if (!mapped) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบสถานะคลังสินค้าที่ระบุ: ' + rawStatus + ' (รองรับ operational, maintenance, full)'
        );
      }
      status = mapped;
    }

    let minCapacity: number | undefined;
    const rawMin = url.searchParams.get('minCapacity');
    if (rawMin !== null && rawMin !== '') {
      minCapacity = parsePositiveInt(rawMin, 1, 1_000_000, 'minCapacity');
    }

    let maxCapacity: number | undefined;
    const rawMax = url.searchParams.get('maxCapacity');
    if (rawMax !== null && rawMax !== '') {
      maxCapacity = parsePositiveInt(rawMax, 1, 1_000_000, 'maxCapacity');
    }

    if (minCapacity !== undefined && maxCapacity !== undefined && minCapacity > maxCapacity) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า minCapacity ต้องไม่มากกว่า maxCapacity');
    }

    const payload = buildLogisticsDashboard({
      provinceCode,
      facilityType,
      status,
      minCapacity,
      maxCapacity,
      search: search || undefined,
    });

    return jsonData(payload, {
      meta: {
        availability: 'ready',
        freshness: 'fresh',
        completeness: 'complete',
        access: 'metadata_only',
        sourceIds: ['pwo', 'dit', 'doae', 'cpd'],
        dataAsOf: '2026-10-25',
        warnings: payload.warnings,
        runtimeMode: 'database',
      },
    });
  });
}
