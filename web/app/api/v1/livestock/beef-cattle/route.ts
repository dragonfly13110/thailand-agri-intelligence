import { handleApi, HubRequestError, jsonData, parseText } from '../../../../../lib/hub/http';
import { loadDldBeefCattleEnvelope } from '../../../../../lib/hub/dld-beef-cattle';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/livestock/beef-cattle
 *
 * Returns approved DLD province rows with their native Buddhist source-year
 * labels. `sourceYearBe` filters the year label; date range filters are not
 * accepted because these rows have no verified calendar date.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    if (url.searchParams.has('from') || url.searchParams.has('to')) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ข้อมูลชุดนี้ใช้ป้ายปีต้นทาง จึงไม่รองรับตัวกรองวันที่');
    }
    const rawYear = parseText(url, 'sourceYearBe', 4);
    let sourceYearBe: number | null = null;
    if (rawYear) {
      if (!/^\d{4}$/.test(rawYear) || Number(rawYear) < 2400) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า sourceYearBe ต้องเป็นปี พ.ศ. 4 หลักจากต้นทาง');
      }
      sourceYearBe = Number(rawYear);
    }
    try {
      const payload = await loadDldBeefCattleEnvelope(sourceYearBe);
      return jsonData(payload.data, { meta: payload.meta });
    } catch (error) {
      if (error instanceof HubRequestError) throw error;
      throw new HubRequestError(503, 'DLD_DATA_UNAVAILABLE', 'ขณะนี้อ่านข้อมูลจริงจากคลังข้อมูลกลางไม่ได้');
    }
  });
}
