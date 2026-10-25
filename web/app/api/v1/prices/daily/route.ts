import { handleApi, jsonData } from '../../../../../lib/hub/http';
import {
  PRICE_SOURCE_METADATA,
  PRICE_WARNINGS,
  getCommodityPrices,
} from '../../../../../lib/hub/price-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/prices/daily
 *
 * Metadata-only response while the OAE/NABC price resources are `pending`.
 * Returns commodity metadata (name, unit, market, frequency, source) but no
 * price/change/history and an explicit empty `prices` array. A zero would be
 * indistinguishable from an observed price, so none is emitted.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const category = url.searchParams.get('category') || undefined;
    const commodities = getCommodityPrices(category);

    return jsonData(
      {
        source: PRICE_SOURCE_METADATA,
        commodities,
        prices: [],
      },
      {
        meta: {
          availability: 'metadata_only',
          freshness: 'unknown',
          completeness: 'unknown',
          access: 'metadata_only',
          sourceIds: ['oae', 'nabc'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: null,
          warnings: PRICE_WARNINGS,
          runtimeMode: 'source_api_fallback',
        },
      },
    );
  });
}
