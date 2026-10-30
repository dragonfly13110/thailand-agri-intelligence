import { handleApi, jsonData } from '../../../../lib/hub/http';
import type { ApiMeta, Freshness } from '../../../../lib/hub/types';
import {
  buildClimateHistoryOverview,
  climateHistoryMetaWarnings,
  validateClimateHistoryQuery,
  type ClimateHistoryOverview,
} from '../../../../lib/hub/climate-history-data';

export const dynamic = 'force-dynamic';

/** Freshness of a grid-point archive read: daily ERA5 is only "fresh" while the
 *  underlying fetch happened within ~45 days of serving the response. */
function era5Freshness(dataAsOf: string | null): Freshness {
  if (!dataAsOf) return 'unknown';
  const timestamp = Date.parse(dataAsOf);
  if (!Number.isFinite(timestamp)) return 'unknown';
  return Date.now() - timestamp <= 45 * 86_400_000 ? 'fresh' : 'stale';
}

function climateMeta(overview: ClimateHistoryOverview): Partial<ApiMeta> {
  if (overview.dataKind !== 'real') {
    // Pinned contract (tests/climate-crop-empty-state.test.ts): while nothing
    // was read for the window the meta stays an honest empty metadata-only reply.
    return {
      availability: 'empty',
      freshness: 'unknown',
      completeness: 'unknown',
      access: 'metadata_only',
      sourceIds: [],
      dataAsOf: null,
      sourceUpdatedAt: null,
      datasetVersion: null,
      warnings: climateHistoryMetaWarnings(overview),
      runtimeMode: 'database',
    };
  }
  const allYearsComplete = overview.years.length > 0
    && overview.years.every((year) => year.completeYear)
    && overview.scope.yearsMissing.length === 0;
  return {
    availability: 'ready',
    freshness: era5Freshness(overview.dataAsOf),
    completeness: allYearsComplete ? 'complete' : 'partial',
    access: 'approved_public',
    sourceIds: ['open_meteo'],
    dataAsOf: overview.dataAsOf,
    sourceUpdatedAt: overview.dataAsOf,
    datasetVersion: overview.provenance.payloadSha256
      ?? overview.provenance.cacheChecksums[0]
      ?? null,
    warnings: climateHistoryMetaWarnings(overview),
    runtimeMode: 'database',
  };
}

/**
 * GET /api/v1/climate-history?provinceCode=73&startYear=2016&endYear=2025
 *
 * Serves real ERA5 values read through the governed D1 publication path or the
 * reviewed local snapshots the existing ingest already fetched; one response
 * always describes exactly one 0.25° grid point. When neither holds rows for
 * the province/window the endpoint returns the pinned empty overview and never
 * publishes generated climate values. `validateClimateHistoryQuery` preserves
 * the 400 INVALID_QUERY rules.
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
    return jsonData(overview, { meta: climateMeta(overview) });
  });
}
