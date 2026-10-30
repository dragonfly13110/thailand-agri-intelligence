import { handleApi, HubRequestError, jsonData } from '../../../../../lib/hub/http';
import {
  CPD_COOP_SOURCE_STATUSES,
  cpdCoopStatusFromQuery,
  loadCooperativesRealCounts,
  type CooperativesRealCountsFilters,
} from '../../../../../lib/hub/cooperatives-data';

export const dynamic = 'force-dynamic';

/** พารามิเตอร์ที่ endpoint นี้รับเท่านั้น เพื่อไม่ให้ตัวกรองที่พิมพ์ผิดถูกมองว่า "ไม่กรอง" */
const KNOWN_PARAMETERS = ['provinceCode', 'sourceStatus', 'sourceYearLabel'] as const;

function singleValue(url: URL, name: (typeof KNOWN_PARAMETERS)[number]): string | null {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) {
    throw new HubRequestError(400, 'INVALID_QUERY', `ระบุพารามิเตอร์ ${name} ซ้ำ`);
  }
  if (values.length === 0) return null;
  const value = values[0].normalize('NFC').trim();
  if (value.length === 0 || value === 'all') return null;
  if (value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HubRequestError(400, 'INVALID_QUERY', `ค่า ${name} ไม่ถูกต้อง`);
  }
  return value;
}

/**
 * GET /api/v1/cooperatives/cpd-counts
 *
 * จำนวนสหกรณ์การเกษตร "จริง" ที่อ่านจากคลังกลาง (D1) ของทรัพยากร CPD ที่อนุมัติแล้ว
 * (resource_key = cpd_agricultural_coop_counts, resource_id = 44463650-5d2e-482b-9919-b1c5b8bc5c6b)
 *
 * เกรนของคำตอบ = เกรนของต้นทาง ไม่มีการรวมค่า:
 * - 1 ระเบียน = ป้ายจังหวัดต้นทาง × หน่วยงานสังกัด × คอลัมน์สถานะต้นทาง × ป้ายปีต้นทาง
 * - meta.dataAsOf = null เสมอ และ row.unit = null เสมอ (ต้นทางไม่ระบุประเภทปี/หน่วยนับ)
 * - ไม่มียอดรวมระดับจังหวัดหรือระดับประเทศ เพราะการบวกข้ามหน่วยงานสังกัด/สถานะเทียบกันไม่ได้
 *
 * พารามิเตอร์ (ไม่บังคับ; เว้นว่างหรือ 'all' = ไม่กรอง; ห้ามส่งซ้ำ; ไม่รู้จักพารามิเตอร์ = 400):
 * - provinceCode = รหัสจังหวัด 2 หลักจากการ crosswalk กับ config/provinces.csv (เช่น 10, 20, 50)
 * - sourceStatus = not_started | operating | dissolved หรือหัวข้อคอลัมน์ต้นทาง
 *   (ยังไม่เริ่มดำเนินการ | ดำเนินการ | เลิกสหกรณ์)
 * - sourceYearLabel = ป้ายปีต้นทางแบบข้อความตรงกับที่บันทึกไว้ (เช่น 2568) ไม่ตีความเป็นปีปฏิทิน
 *
 * สถานะ HTTP:
 * - 200 เมื่ออ่านคลังสำเร็จ data.sample = false และ meta.availability =
 *   ready | empty | metadata_only | unavailable ตามที่อ่านได้จริง
 *   (ตัวกรองที่ถูกแต่ไม่มีแถวตรง = 200 + availability 'empty' ไม่ใช่ 404)
 * - 503 CPD_COOP_SNAPSHOT_INVALID / CPD_COOP_UNAVAILABLE เมื่อแถวในคลังไม่ตรงสัญญาที่อนุมัติ
 *   หรืออ่านคลังไม่สำเร็จ endpoint นี้ไม่คืนตัวเลขตัวอย่างแทนข้อมูลจริงในทุกกรณี
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    for (const key of url.searchParams.keys()) {
      if (!(KNOWN_PARAMETERS as readonly string[]).includes(key)) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่รู้จักพารามิเตอร์: ' + key);
      }
    }

    const filters: CooperativesRealCountsFilters = {};

    const rawProvince = singleValue(url, 'provinceCode');
    if (rawProvince !== null) {
      if (!/^\d{2}$/.test(rawProvince)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `ค่า provinceCode "${rawProvince}" ไม่ถูกต้อง — ต้องเป็นรหัสจังหวัด 2 หลัก (เช่น 10, 20, 50) หรือ all`,
        );
      }
      filters.provinceCode = rawProvince;
    }

    const rawStatus = singleValue(url, 'sourceStatus');
    if (rawStatus !== null) {
      const resolved = cpdCoopStatusFromQuery(rawStatus);
      if (resolved === null) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ sourceStatus ค่า "${rawStatus}" ไม่รู้จัก — ใช้ได้เฉพาะ `
            + CPD_COOP_SOURCE_STATUSES.map((status) => `${status.id} (${status.sourceColumn})`).join(', ')
            + ' หรือ all',
        );
      }
      filters.sourceStatus = resolved;
    }

    const rawYearLabel = singleValue(url, 'sourceYearLabel');
    if (rawYearLabel !== null) filters.sourceYearLabel = rawYearLabel;

    const envelope = await loadCooperativesRealCounts(filters);
    return jsonData(envelope.data, { meta: envelope.meta });
  });
}
