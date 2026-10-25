import { handleApi, jsonData } from '../../../../lib/hub/http';
import { buildWeatherOverview, WEATHER_WARNINGS } from '../../../../lib/hub/weather-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/weather?provinceCode=73  (or ?region=central)
 *
 * Reads one forecast view for a province or a region. Numeric values are
 * deterministic sample data while the TMD resource licence is pending; the
 * hub meta keeps `access: 'metadata_only'` and repeats the sample warnings so
 * no pending upstream number can be mistaken for published data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const overview = await buildWeatherOverview(url);
    return jsonData(overview, {
      meta: {
        availability: 'ready',
        freshness: 'fresh',
        completeness: overview.cumulative.completeness,
        access: 'metadata_only',
        sourceIds: ['tmd'],
        dataAsOf: overview.issuedAt,
        sourceUpdatedAt: null,
        datasetVersion: 'weather-forecast-sample-v1',
        warnings: WEATHER_WARNINGS,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
