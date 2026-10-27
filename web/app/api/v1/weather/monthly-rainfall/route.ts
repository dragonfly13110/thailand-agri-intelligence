import {
  freshness,
  handleApi,
  HubRequestError,
  jsonData,
  parsePage,
} from '../../../../../lib/hub/http';
import { isSupportedProvinceCode } from '../../../../../lib/hub/province';
import {
  parseMonthlyRainfallFilters,
  readMonthlyRainfallSnapshot,
  toMonthlyRainfallRead,
  type MonthlyRainfallSnapshot,
} from '../../../../../lib/hub/monthly-rainfall-repository';
import { monthlyRainfallResponse } from '../../../../../lib/hub/weather-monthly-data';

export const dynamic = 'force-dynamic';

const NO_READ: MonthlyRainfallSnapshot = { payload: null, batch: null, directory: null };

/**
 * GET /api/v1/weather/monthly-rainfall
 *
 * Serves the TMD station × calendar-month rainfall rows that the hub already
 * published to D1 (`https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php`).
 * Only the shared reader's publication gate decides what is visible, and the read
 * is bounded: at most 20,000 rows are walked and a shortfall is reported as
 * partial instead of being presented as the whole batch.
 *
 * Four outcomes are kept apart on purpose:
 * - `runtimeMode: source_api_fallback` + `metadata_only` — the warehouse could
 *   not be read, which is not "no rain";
 * - `availability: metadata_only` — the read succeeded but no active numeric
 *   batch of this resource exists;
 * - `availability: empty` — a batch exists but no station × month matches the
 *   filters; the response still carries the `directory` of what can be picked;
 * - `availability: ready` — published rows, with the run's own provenance.
 *
 * Units are never asserted: `observations.unit` is NULL and
 * `unit_status=pending_official_confirmation`, so each station repeats the
 * provider's declared unit as metadata only. No province average, yearly total,
 * anomaly or drought threshold is derived from those numbers.
 *
 * Query: `page`, `pageSize`, and the optional filters `provinceCode=NN` (a code
 * in the 77-province register), `stationCode=48300`, `year=2026` (four-digit CE).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const page = parsePage(url);
    const filters = parseMonthlyRainfallFilters(url);
    if (filters.provinceCode && !await isSupportedProvinceCode(filters.provinceCode)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่อยู่ในทะเบียนที่รองรับ');
    }

    let snapshot: MonthlyRainfallSnapshot = NO_READ;
    let databaseRead = false;
    try {
      snapshot = await readMonthlyRainfallSnapshot(filters);
      databaseRead = true;
    } catch (error) {
      // A failing read belongs in the log, but it must not be reported as an
      // empty result set: the body stays metadata-only either way.
      console.warn('[monthly-rainfall] read failed', error instanceof Error ? error.message : String(error));
    }

    const read = toMonthlyRainfallRead(snapshot, filters, databaseRead);
    const response = monthlyRainfallResponse(read, page);
    const batch = snapshot.batch;

    return jsonData(response.data, {
      meta: {
        ...response.meta,
        freshness: freshness(batch?.sourceUpdatedAt ?? batch?.runCompletedAt ?? null, batch?.freshnessDays ?? null),
      },
      pagination: response.pagination,
    });
  });
}
