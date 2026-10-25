import { getDatabaseKind } from '../../../../../../lib/hub/db';
import { HubRequestError, handleApi } from '../../../../../../lib/hub/http';
import { emptyFallbackPage, listDbSeries } from '../../../../../../lib/hub/numeric-repository';
import { listD1Series } from '../../../../../../lib/hub/d1-numeric-repository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const { id } = await context.params;
    if (!id || id.length > 260) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
    const databaseKind = await getDatabaseKind();
    if (databaseKind === 'd1') return listD1Series(id, url);
    if (databaseKind === 'postgres') return listDbSeries(id, url);
    return emptyFallbackPage(url, 'ยังไม่มีฐานข้อมูลกลาง จึงไม่สามารถแสดงชุดข้อมูลตัวเลขได้');
  });
}
