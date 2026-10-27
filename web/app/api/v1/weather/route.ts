import { handleApi, jsonData } from '../../../../lib/hub/http';
import { buildWeatherOverview, WEATHER_WARNINGS } from '../../../../lib/hub/weather-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/weather?provinceCode=73  (or ?region=central)
 *
 * No approved forecast batch is available for this contract. Real TMD HPC
 * forecast and station observation data remain on their separate endpoints.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const overview = await buildWeatherOverview(url);
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
        warnings: WEATHER_WARNINGS,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
