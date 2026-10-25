import { handleApi, jsonData, parsePage } from '../../../../../lib/hub/http';
import { buildWaterMetadataPayload, WATER_WARNINGS } from '../../../../../lib/hub/water-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/water/reservoirs
 *
 * Metadata-only response while the RID reservoir report is `pending` in
 * `config/resource_licenses.json`. The endpoint intentionally returns no
 * capacity, volume, percentage or reservoir count; `data.reservoirs` is empty
 * and `data.summary` is null so an empty page can never be read as zero water.
 *
 * Governance flags: availability/access = `metadata_only`, completeness =
 * `unknown`, `cache-control: no-store`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const page = parsePage(url);
    return jsonData(buildWaterMetadataPayload(), {
      meta: {
        availability: 'metadata_only',
        freshness: 'unknown',
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: ['rid'],
        dataAsOf: null,
        sourceUpdatedAt: null,
        datasetVersion: null,
        warnings: WATER_WARNINGS,
        runtimeMode: 'source_api_fallback',
      },
      pagination: { page: page.page, pageSize: page.pageSize, total: 0 },
    });
  });
}
