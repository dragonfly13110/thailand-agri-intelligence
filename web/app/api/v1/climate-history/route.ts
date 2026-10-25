import { handleApi, jsonData } from '../../../../lib/hub/http';
import {
  buildClimateHistoryOverview,
  CLIMATE_HISTORY_WARNINGS,
  CLIMATE_HISTORY_VERSION,
  validateClimateHistoryQuery,
} from '../../../../lib/hub/climate-history-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/climate-history?provinceCode=10&startYear=2005&endYear=2024
 *
 * Returns one historical climate overview for a province over a 10-20 year
 * window. `validateClimateHistoryQuery` throws a 400 INVALID_QUERY when the
 * province code is missing or not a valid province, or when the year window
 * breaks the 10-20 year rule. The ERA5/Open-Meteo resource licence is still
 * pending, so the hub meta keeps `access: 'metadata_only'` and repeats the
 * sample warnings so no pending upstream number can be mistaken for
 * published data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const validated = validateClimateHistoryQuery({
      provinceCode: url.searchParams.get('provinceCode') ?? '',
      startYear: url.searchParams.get('startYear'),
      endYear: url.searchParams.get('endYear'),
    });
    const overview = await buildClimateHistoryOverview(validated);
    return jsonData(overview, {
      meta: {
        availability: 'ready',
        freshness: 'fresh',
        completeness: 'complete',
        access: 'metadata_only',
        sourceIds: ['open_meteo'],
        dataAsOf: `${overview.endYear}-12-31`,
        sourceUpdatedAt: null,
        datasetVersion: CLIMATE_HISTORY_VERSION,
        warnings: CLIMATE_HISTORY_WARNINGS,
        runtimeMode: 'database',
      },
    });
  });
}
