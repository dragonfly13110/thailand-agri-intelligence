import { handleApi, jsonData } from '../../../../../lib/hub/http';
import {
  getNwpRunner,
  getNwpThresholds,
  parseGridQuery,
  readNwpProvinces,
} from '../../../../../lib/hub/nwp-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/nwp/provinces?runId=...&variable=...&validAt=...
 *
 * Returns the provincial watchlist of one forecast step. `value` is the
 * maximum block maximum inside 25 km of the province reference point — not a
 * provincial average and not a single point of the province. `unit` stays
 * `null`, and `riskLevel` stays `null` until the run has confirmed units.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const query = parseGridQuery(url);
    const runner = await getNwpRunner();
    const thresholds = await getNwpThresholds();
    const payload = await readNwpProvinces(query, runner, thresholds);
    return jsonData(payload.data, { meta: payload.meta });
  });
}
