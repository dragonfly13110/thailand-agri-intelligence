import { handleApi, jsonData } from '../../../../../lib/hub/http';
import { assertKnownParams, getNwpRunner, readNwpRuns } from '../../../../../lib/hub/nwp-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/nwp/runs
 *
 * Returns the usable TMD HPC forecast runs (Thailand 3 km domain), newest
 * `init_at` first, at most 5 rows. The payload is run metadata only — the
 * numbers live in `/api/v1/nwp/grid` and `/api/v1/nwp/provinces`, and every
 * value there is a model forecast, never an observation.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    // The runs endpoint takes no query parameter.
    assertKnownParams(url, []);
    const runner = await getNwpRunner();
    const payload = await readNwpRuns(runner);
    return jsonData({ runs: payload.data }, { meta: payload.meta });
  });
}
