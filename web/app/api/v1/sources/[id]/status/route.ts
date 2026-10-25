import { hasDatabase } from '../../../../../../lib/hub/db';
import { HubRequestError, handleApi } from '../../../../../../lib/hub/http';
import { getDbSourceStatus } from '../../../../../../lib/hub/catalog-repository';
import { getFallbackSourceStatus } from '../../../../../../lib/hub/source-fallback';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  void request;
  return handleApi(async () => {
    const { id } = await context.params;
    if (!id || id.length > 80) throw new HubRequestError(400, 'INVALID_ID', 'รหัสแหล่งข้อมูลไม่ถูกต้อง');
    return (await hasDatabase()) ? getDbSourceStatus(id) : getFallbackSourceStatus(id);
  });
}
