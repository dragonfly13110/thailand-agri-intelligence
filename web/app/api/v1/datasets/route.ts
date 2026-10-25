import { hasDatabase } from '../../../../lib/hub/db';
import { handleApi } from '../../../../lib/hub/http';
import { listDbDatasets } from '../../../../lib/hub/catalog-repository';
import { listFallbackDatasets } from '../../../../lib/hub/source-fallback';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => (await hasDatabase()) ? listDbDatasets(url) : listFallbackDatasets(url));
}
