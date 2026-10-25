import { hasNumericDatabase } from '../../../../../lib/hub/db';
import { HubRequestError, handleApi } from '../../../../../lib/hub/http';
import { emptyFallbackPage, listDbAreaEvidence } from '../../../../../lib/hub/numeric-repository';
import { isSupportedProvinceCode } from '../../../../../lib/hub/province';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ provinceCode: string }> };

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const { provinceCode } = await context.params;
    if (!await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400, 'INVALID_ID', 'รหัสจังหวัดไม่ถูกต้อง');
    return (await hasNumericDatabase())
      ? listDbAreaEvidence(provinceCode, url)
      : emptyFallbackPage(url, 'ยังไม่มีฐานข้อมูลกลาง จึงยังไม่มีหลักฐานตัวเลขรายจังหวัด');
  });
}
