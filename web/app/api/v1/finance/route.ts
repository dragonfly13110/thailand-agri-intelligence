import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildFinanceDashboard,
  FINANCE_AS_OF_DATE,
  FINANCE_DATA_VERSION,
  FINANCE_PROVINCE_MAP,
  FINANCE_SOURCES,
  FINANCE_WARNINGS,
  type ProgramFilter,
} from '../../../../lib/hub/finance-data';

export const dynamic = 'force-dynamic';

const PROGRAM_ALIASES: Record<string, ProgramFilter> = {
  all: 'all',
  ทั้งหมด: 'all',
  ทุกโครงการ: 'all',
  rice: 'rice_annual',
  rice_annual: 'rice_annual',
  ข้าว: 'rice_annual',
  ข้าวนาปี: 'rice_annual',
  corn: 'feed_corn',
  feed_corn: 'feed_corn',
  maize: 'feed_corn',
  ข้าวโพด: 'feed_corn',
  ข้าวโพดเลี้ยงสัตว์: 'feed_corn',
};

/**
 * GET /api/v1/finance?provinceCode=73&program=rice_annual
 *
 * ค่าเริ่มต้นคือทั้งประเทศและทุกโครงการ ข้อมูลทุกค่าเป็น Deterministic Sample
 * จึงตอบ meta.access = 'metadata_only' และแนบ warnings ทุกครั้ง
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 8);
    const rawProgram = parseText(url, 'program', 40).toLowerCase();

    let provinceCode: string | null = null;
    if (rawProvince) {
      if (!FINANCE_PROVINCE_MAP.has(rawProvince)) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง ต้องเป็นรหัส 2 หลักที่มีในทะเบียน 77 จังหวัด');
      }
      provinceCode = rawProvince;
    }

    let program: ProgramFilter = 'all';
    if (rawProgram) {
      const resolved = PROGRAM_ALIASES[rawProgram];
      if (!resolved) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า program ไม่ถูกต้อง ใช้ all, rice_annual หรือ feed_corn');
      }
      program = resolved;
    }

    const payload = buildFinanceDashboard({ provinceCode, program });
    const hasRecords = payload.records.length > 0;

    return jsonData(payload, {
      meta: {
        availability: hasRecords ? 'ready' : 'empty',
        freshness: 'fresh',
        completeness: hasRecords ? 'partial' : 'unknown',
        access: 'metadata_only',
        sourceIds: FINANCE_SOURCES.map((source) => source.id),
        dataAsOf: FINANCE_AS_OF_DATE,
        sourceUpdatedAt: null,
        datasetVersion: FINANCE_DATA_VERSION,
        warnings: FINANCE_WARNINGS,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
