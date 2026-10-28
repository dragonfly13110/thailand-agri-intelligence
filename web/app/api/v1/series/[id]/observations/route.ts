import { getDatabaseKind } from '../../../../../../lib/hub/db';
import { HubRequestError, handleApi } from '../../../../../../lib/hub/http';
import { emptyFallbackPage, listDbSeriesObservations } from '../../../../../../lib/hub/numeric-repository';
import { listD1SeriesObservations } from '../../../../../../lib/hub/d1-numeric-repository';
import { MAX_SERIES_ID_LENGTH } from '../../../../../../lib/hub/series-id';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const { id } = await context.params;
    if (!id || id.length > MAX_SERIES_ID_LENGTH) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
    const databaseKind = await getDatabaseKind();
    if (databaseKind === 'd1') return listD1SeriesObservations(id, url);
    if (databaseKind === 'postgres') return listDbSeriesObservations(id, url);
    return emptyFallbackPage(url, 'ยังไม่มีฐานข้อมูลกลาง จึงไม่สามารถแสดงตัวเลขย้อนหลังได้');
  });
}
