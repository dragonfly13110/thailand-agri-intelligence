import { handleApi, HubRequestError, jsonData, parsePositiveInt, parseText } from '../../../../lib/hub/http';
import {
  AVAILABLE_YEARS,
  buildTradeDashboard,
  COMMODITY_TRADE_PROFILES,
} from '../../../../lib/hub/trade-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/trade
 *
 * สถิติการค้าและการส่งออก-นำเข้าสินค้าเกษตรสำคัญของไทย
 * แหล่งอ้างอิง: กรมศุลกากร, กระทรวงพาณิชย์ (สนค. TPSO), สำนักงานเศรษฐกิจการเกษตร (สศก. OAE)
 *
 * Query Parameters:
 * - commodity: 'rice' | 'durian' | 'rubber' | 'cassava' | 'palm' | 'all' (ค่าเริ่มต้น = 'all')
 * - year: 2024, 2023, 2022 หรือ 2567, 2566, 2565 (ค่าเริ่มต้น = 2024 / 2567)
 *
 * สิทธิ์และ Data Governance (AGENTS.md):
 * - access: 'metadata_only'
 * - sample: true (Deterministic Sample Data)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawCommodity = parseText(url, 'commodity', 30);
    const rawYear = url.searchParams.get('year');

    let year = 2024;
    if (rawYear) {
      const parsedYear = parsePositiveInt(rawYear, 2024, 2600, 'year');
      // รองรับทั้งปี พ.ศ. (เช่น 2567) และ ค.ศ. (เช่น 2024)
      const ceYear = parsedYear > 2400 ? parsedYear - 543 : parsedYear;
      if (!AVAILABLE_YEARS.includes(ceYear)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `ปีที่ระบุ (${parsedYear}) ไม่อยู่ในช่วงข้อมูลที่มี (${AVAILABLE_YEARS.map((y) => `${y + 543} / ${y}`).join(', ')})`,
        );
      }
      year = ceYear;
    }

    const validCommodityIds = COMMODITY_TRADE_PROFILES.map((p) => p.id);
    let commodityId = 'all';
    if (rawCommodity && rawCommodity !== 'all') {
      const lower = rawCommodity.toLowerCase();
      // alias oil-palm -> palm
      const mapped = lower === 'oil-palm' ? 'palm' : lower;
      if (!validCommodityIds.includes(mapped)) {
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
        freshness: 'fresh',
        completeness: 'complete',
        access: payload.meta.access,
        sourceIds: payload.meta.sourceIds,
        dataAsOf: payload.meta.dataAsOf,
        sourceUpdatedAt: payload.meta.dataAsOf,
        datasetVersion: payload.meta.datasetVersion,
        warnings: payload.meta.warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
