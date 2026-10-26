import { handleApi, jsonData, parsePage } from '../../../../lib/hub/http';
import {
  buildEarlyWarningDataset,
  filterCriticalReservoirs,
  filterProvinceRisks,
  filterRiskSignals,
  type RiskSignalSourceId,
  type RiskType,
} from '../../../../lib/hub/early-warning-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/early-warning
 *
 * Assembles the agricultural flood/drought warning from the measurements the hub
 * has actually published: RID reservoir storage (`readWaterSnapshot`), the GISTDA
 * 7-day flood polygons, and TMD station rainfall/temperature
 * (`readWeatherSnapshot`). Each signal carries the source that produced it plus
 * its own `dataAsOf`, and the payload states that the risk level, the 0-100 index
 * and the advisory are TADIH's internal analytics — not an official disaster
 * declaration.
 *
 * When no numeric batch is readable (no D1 binding, offline run) the route
 * returns the deterministic simulation envelope instead of mixing real and
 * synthetic rows: `sample: true`, `meta.access = metadata_only`,
 * `dataAsOf: null`, `no-store`. The forward forecast block is always the
 * simulation layer because no approved forecast resource exists yet.
 *
 * Query: `region`, `risk`, `type=flood|drought`, `source=rid|gistda|tmd`, `q`,
 * and `page`/`pageSize` for the signal list (one measured row = one signal, so
 * the list is paginated while the provincial matrix and the summary are not).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const region = url.searchParams.get('region') || undefined;
    const risk = url.searchParams.get('risk') || undefined;
    const type = (url.searchParams.get('type') as RiskType) || undefined;
    const sourceId = (url.searchParams.get('source') as RiskSignalSourceId) || undefined;
    const query = url.searchParams.get('q') || undefined;
    const page = parsePage(url);

    const dataset = await buildEarlyWarningDataset();
    const filters = { region, risk, query, type };
    const provinces = filterProvinceRisks(dataset.provinces, filters);
    const signals = filterRiskSignals(dataset.signals, { region, risk, type, sourceId, query });
    const criticalReservoirs = filterCriticalReservoirs(dataset.criticalReservoirs, { region, query });
    const isRealEvidence = dataset.mode === 'real_evidence';
    const start = (page.page - 1) * page.pageSize;

    return jsonData(
      {
        mode: dataset.mode,
        sample: dataset.sample,
        bannerText: dataset.bannerText,
        disclaimer: dataset.disclaimer,
        summary: dataset.summary,
        provinces,
        provinceCount: dataset.provinces.length,
        signals: signals.slice(start, start + page.pageSize),
        signalCount: dataset.signals.length,
        filteredSignalCount: signals.length,
        forecast14Days: dataset.forecast14Days,
        layerGovernance: dataset.layerGovernance,
        criticalReservoirsSummary: {
          totalCritical: dataset.criticalReservoirs.length,
          overflowCount: dataset.summary.criticalFloodCount,
          droughtCount: dataset.summary.criticalDroughtCount,
          grain: 'reservoir × report_date',
          sampleList: criticalReservoirs.slice(0, 15),
        },
        sourceProvenance: dataset.sources,
        sources: isRealEvidence
          ? dataset.sources
              .filter((source) => source.applied)
              .map((source) => ({
                id: source.id,
                name: source.name,
                type: 'government_observation',
                access: 'approved_public',
                attribution: source.attribution,
                endpoint: source.endpoint,
                grain: source.grain,
                dataAsOf: source.dataAsOf,
              }))
          : [
              {
                id: 'early-warning-simulation',
                name: 'แบบจำลองเตือนภัยพิบัติการเกษตรล่วงหน้า 14 วัน (Simulation Model)',
                type: 'deterministic_mock',
                access: 'metadata_only',
                attribution: 'ศูนย์ข้อมูลเกษตรไทย (TADIH) — ชุดข้อมูลสังเคราะห์เพื่อการสาธิต',
                grain: 'reservoir × report_date (synthetic)',
                dataAsOf: null,
              },
            ],
      },
      {
        meta: dataset.apiMeta,
        pagination: { page: page.page, pageSize: page.pageSize, total: signals.length },
      },
    );
  });
}
