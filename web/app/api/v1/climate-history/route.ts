import { handleApi, jsonData } from '../../../../lib/hub/http';
import {
  buildClimateHistoryOverview,
  CLIMATE_HISTORY_WARNINGS,
  validateClimateHistoryQuery,
} from '../../../../lib/hub/climate-history-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/climate-history?provinceCode=10&startYear=2005&endYear=2024
 *
 * No active approved batch covers the requested 10-20 year window, so the endpoint
 * returns an empty overview and never publishes generated climate values.
 * `validateClimateHistoryQuery` preserves the 400 INVALID_QUERY rules.
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
        availability: 'empty',
        freshness: 'unknown',
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: [],
        dataAsOf: null,
        sourceUpdatedAt: null,
        datasetVersion: null,
        warnings: CLIMATE_HISTORY_WARNINGS,
        runtimeMode: 'database',
      },
    });
  });
}
