import { handleApi, jsonData } from '../../../../lib/hub/http';
import {
  EARLY_WARNING_WARNINGS,
  SAMPLE_GOVERNANCE,
  get14DaySimulationForecast,
  getCriticalReservoirs,
  getEarlyWarningSummary,
  getProvinceRisks,
  type RiskType,
} from '../../../../lib/hub/early-warning-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/early-warning
 *
 * Deterministic simulation only. The route no longer imports the RID reservoir
 * snapshot: reservoir rows are synthetic (`sim-rsv-*`), the response is
 * `metadata_only` / `sample: true`, completeness is `unknown` and the payload
 * is never cached (`cache-control: no-store`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const region = url.searchParams.get('region') || undefined;
    const risk = url.searchParams.get('risk') || undefined;
    const type = (url.searchParams.get('type') as RiskType) || undefined;
    const query = url.searchParams.get('q') || undefined;

    const summary = getEarlyWarningSummary();
    const provinces = getProvinceRisks({ region, risk, query, type });
    const forecast14Days = get14DaySimulationForecast();
    const criticalReservoirs = getCriticalReservoirs({ region, query });

    return jsonData(
      {
        sample: SAMPLE_GOVERNANCE.sample,
        bannerText: SAMPLE_GOVERNANCE.bannerText,
        disclaimer: SAMPLE_GOVERNANCE.disclaimer,
        summary,
        provinces,
        forecast14Days,
        criticalReservoirsSummary: {
          totalCritical: criticalReservoirs.length,
          overflowCount: summary.criticalFloodCount,
          droughtCount: summary.criticalDroughtCount,
          sampleList: criticalReservoirs.slice(0, 15),
        },
        sources: [
          {
            id: 'early-warning-simulation',
            name: 'แบบจำลองเตือนภัยพิบัติการเกษตรล่วงหน้า 14 วัน (Simulation Model)',
            type: 'deterministic_mock',
            access: 'metadata_only',
          },
        ],
      },
      {
        meta: {
          availability: 'metadata_only',
          freshness: 'unknown',
          completeness: 'unknown',
          access: 'metadata_only',
          sourceIds: ['early-warning-simulation'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: SAMPLE_GOVERNANCE.version,
          warnings: EARLY_WARNING_WARNINGS,
          runtimeMode: 'source_api_fallback',
        },
      },
    );
  });
}
