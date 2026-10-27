import { handleApi, jsonData } from '../../../../../lib/hub/http';
import { getNwpRunner, parseGridQuery, readNwpGrid } from '../../../../../lib/hub/nwp-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/nwp/grid?runId=...&variable=...&validAt=...
 *
 * Returns one downsampled forecast grid (0.15° blocks over the fixed
 * Thailand bbox) with the block mean and the block maximum of every cell.
 * `mean` / `max` are row-major, exactly `nx * ny` long, and keep `null` for
 * blocks without source cells. `unit` stays `null` until TMD confirms the
 * units in writing. Access follows the exact-resource registry; unit status
 * controls interpretation only, while `publicationMode` remains the kill switch.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const query = parseGridQuery(url);
    const runner = await getNwpRunner();
    const payload = await readNwpGrid(query, runner);
    return jsonData(payload.data, { meta: payload.meta });
  });
}
