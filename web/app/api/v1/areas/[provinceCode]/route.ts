import { getDatabaseKind } from '../../../../../lib/hub/db';
import { HubRequestError, handleApi } from '../../../../../lib/hub/http';
import { emptyFallbackPage, listDbAreaEvidence } from '../../../../../lib/hub/numeric-repository';
import { listD1AreaEvidence } from '../../../../../lib/hub/d1-numeric-repository';
import { isSupportedProvinceCode } from '../../../../../lib/hub/province';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ provinceCode: string }> };

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const { provinceCode } = await context.params;
    if (!await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400, 'INVALID_ID', 'รหัสจังหวัดไม่ถูกต้อง');
    const databaseKind = await getDatabaseKind();
    if (databaseKind === 'd1') return listD1AreaEvidence(provinceCode, url);
    if (databaseKind === 'postgres') return listDbAreaEvidence(provinceCode, url);
    return emptyFallbackPage(url, 'ยังไม่มีฐานข้อมูลกลาง จึงยังไม่มีหลักฐานตัวเลขรายจังหวัด');
  });
}
