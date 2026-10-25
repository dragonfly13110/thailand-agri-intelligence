import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import { getOpenDataAnalytics } from '../../../../lib/hub/open-data-analytics';

export const dynamic = 'force-dynamic';

/** Public catalog metadata statistics, not permission to redistribute resource values. */
export async function GET(request: Request) {
  return handleApi(async () => {
    const url = new URL(request.url);
    for (const name of url.searchParams.keys()) {
      if (name !== 'sourceId' && name !== 'format') {
        throw new HubRequestError(400, 'INVALID_QUERY', 'รองรับเฉพาะตัวกรอง sourceId และ format');
      }
      if (url.searchParams.getAll(name).length > 1) {
        throw new HubRequestError(400, 'INVALID_QUERY', 'ส่งตัวกรองแต่ละรายการได้เพียงครั้งเดียว');
      }
    }

    const sourceId = parseText(url, 'sourceId', 80).toLowerCase();
    const format = parseText(url, 'format', 80).toUpperCase();
    if (sourceId && !/^[a-z0-9][a-z0-9._-]*$/.test(sourceId)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รูปแบบรหัสแหล่งข้อมูลไม่ถูกต้อง');
    }
    if (format && !/^[A-Z0-9][A-Z0-9._+ /-]*$/.test(format)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รูปแบบตัวกรองไฟล์ไม่ถูกต้อง');
    }

    const analytics = await getOpenDataAnalytics({
      ...(sourceId ? { sourceId } : {}),
      ...(format ? { format } : {}),
    });
    if (analytics.availability === 'unavailable') {
      throw new HubRequestError(503, 'SOURCE_UNAVAILABLE', 'ขณะนี้อ่านสถิติบัญชีข้อมูลกลางไม่ได้');
    }

    return jsonData(analytics, {
      meta: {
        availability: analytics.availability,
        access: 'metadata_only',
        freshness: 'unknown',
        completeness: analytics.completeness,
        sourceIds: analytics.agencies.map((agency) => agency.sourceId),
        warnings: analytics.notes,
        runtimeMode: 'database',
      },
    });
  });
}
