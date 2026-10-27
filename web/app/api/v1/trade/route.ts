import { handleApi, HubRequestError, jsonData, parsePositiveInt, parseText } from '../../../../lib/hub/http';
import {
  buildTradeDashboard,
  SUPPORTED_TRADE_COMMODITIES,
  SUPPORTED_TRADE_YEARS,
} from '../../../../lib/hub/trade-data';

export const dynamic = 'force-dynamic';

const ALLOWED_PARAMS = ['commodity', 'year'] as const;

/** ปฏิเสธพารามิเตอร์ที่ไม่รู้จัก ซ้ำ หรือระบุแต่ค่าว่าง — คงมาตรฐาน 400 INVALID_QUERY */
function validateQuery(url: URL) {
  const allowed = new Set<string>(ALLOWED_PARAMS);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่รู้จักพารามิเตอร์: ' + key);
    }
  }
  for (const name of ALLOWED_PARAMS) {
    if (url.searchParams.getAll(name).length > 1) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ระบุพารามิเตอร์ซ้ำ: ' + name);
    }
    if (url.searchParams.has(name) && !url.searchParams.get(name)?.trim()) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ต้องไม่ว่าง');
    }
  }
}

/**
 * GET /api/v1/trade
 *
 * สถิติการค้าและการส่งออก-นำเข้าสินค้าเกษตรสำคัญของไทย
 * แหล่งอ้างอิง: กรมศุลกากร, กระทรวงพาณิชย์ (สนค. TPSO), สำนักงานเศรษฐกิจการเกษตร (สศก. OAE), data.go.th
 *
 * Query Parameters:
 * - commodity: 'rice' | 'durian' | 'rubber' | 'cassava' | 'palm' | 'all' (ค่าเริ่มต้น = 'all')
 * - year: 2024, 2023, 2022 หรือ 2567, 2566, 2565 (ค่าเริ่มต้น = 2024 / 2567)
 *
 * ยังไม่มีระเบียนตัวเลขการค้าที่อนุมัติ จึงตอบ empty/metadata_only โดยไม่เติมข้อมูลตัวอย่าง
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    validateQuery(url);
    const rawCommodity = parseText(url, 'commodity', 30);
    const rawYear = url.searchParams.get('year');

    let year = 2024;
    if (rawYear) {
      const parsedYear = parsePositiveInt(rawYear, 2024, 2600, 'year');
      // รองรับทั้งปี พ.ศ. (เช่น 2567) และ ค.ศ. (เช่น 2024)
      const ceYear = parsedYear > 2400 ? parsedYear - 543 : parsedYear;
      if (!SUPPORTED_TRADE_YEARS.some((supportedYear) => supportedYear === ceYear)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `ปีที่ระบุ (${parsedYear}) ไม่อยู่ในช่วงที่รองรับ (${SUPPORTED_TRADE_YEARS.map((y) => `${y + 543} / ${y}`).join(', ')})`,
        );
      }
      year = ceYear;
    }

    const validCommodityIds = SUPPORTED_TRADE_COMMODITIES;
    let commodityId = 'all';
    if (rawCommodity && rawCommodity !== 'all') {
      const lower = rawCommodity.toLowerCase();
      // alias oil-palm -> palm
      const mapped = lower === 'oil-palm' ? 'palm' : lower;
      if (!validCommodityIds.some((id) => id === mapped)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `ไม่พบหมวดสินค้าที่ระบุ: ${rawCommodity} (หมวดที่รองรับ: all, ${validCommodityIds.join(', ')})`,
        );
      }
      commodityId = mapped;
    }

    const payload = buildTradeDashboard({ year, commodityId });

    return jsonData(payload, {
      meta: {
        availability: payload.meta.availability,
        freshness: 'unknown',
        completeness: 'unknown',
        access: payload.meta.access,
        sourceIds: payload.meta.sourceIds,
        dataAsOf: payload.meta.dataAsOf,
        sourceUpdatedAt: null,
        datasetVersion: payload.meta.datasetVersion,
        warnings: payload.meta.warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
