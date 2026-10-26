import {
  completeness,
  freshness,
  handleApi,
  HubRequestError,
  jsonData,
  parseDate,
  parsePage,
  parseText,
} from '../../../../../lib/hub/http';
import { isSupportedProvinceCode } from '../../../../../lib/hub/province';
import { readWeatherSnapshot, type WeatherSnapshot } from '../../../../../lib/hub/weather-repository';
import {
  WEATHER_OBSERVATION_FALLBACK_WARNINGS,
  WEATHER_OBSERVATION_WARNINGS,
  buildWeatherObservationsMetadataPayload,
} from '../../../../../lib/hub/weather-observations-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/weather/observations
 *
 * Serves the real station observations that the hub has published to D1:
 * TMD agro-met/synoptic daily values plus the ERA5 reanalysis days, each row
 * gated by `approved_public` + `project_publication_approved` and an active
 * `kind='numeric'` run (that filter lives in `d1-numeric-repository` and cannot
 * be switched off here).
 *
 * This route is deliberately separate from `/api/v1/weather`: that route is a
 * 7-day forecast view and still carries `sample: true`, because no approved
 * forecast resource exists yet. Real observations and a demo forecast are never
 * mixed in one body.
 *
 * When D1 cannot be read, or holds no published weather batch, the route answers
 * the metadata-only envelope (`stations: []`, `summary: null`) so an empty result
 * is never readable as "no rain".
 *
 * Query: `page`, `pageSize`, optional `provinceCode=NN` (matched on the station's
 * registered province, from `dimensions`), optional `date=YYYY-MM-DD`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const page = parsePage(url);
    const date = parseDate(url, 'date');
    const provinceCode = parseText(url, 'provinceCode', 2);
    if (provinceCode && !/^\d{2}$/.test(provinceCode)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
    }
    if (provinceCode && !await isSupportedProvinceCode(provinceCode)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
    }

    // Three honest outcomes: unreadable database, no publishable batch, real numbers.
    let snapshot: WeatherSnapshot | null = null;
    let databaseRead = false;
    try {
      snapshot = await readWeatherSnapshot({ provinceCode, date });
      databaseRead = true;
    } catch (error) {
      // A failing read must never look like "no data", but it must not be
      // invisible either: the reason belongs in the server log.
      console.warn('[weather] observation read failed', error instanceof Error ? error.message : String(error));
    }

    if (!snapshot?.payload) {
      return jsonData(buildWeatherObservationsMetadataPayload(), {
        meta: {
          availability: 'metadata_only',
          freshness: 'unknown',
          completeness: 'unknown',
          access: 'metadata_only',
          sourceIds: ['tmd', 'open_meteo'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: null,
          warnings: databaseRead
            ? [...WEATHER_OBSERVATION_FALLBACK_WARNINGS, date
                ? `อ่านคลังข้อมูลกลางสำเร็จ แต่ไม่มีแถวที่เผยแพร่ได้สำหรับวันที่ ${date}`
                : 'อ่านคลังข้อมูลกลางสำเร็จ แต่ไม่มี active numeric batch ของทรัพยากรอากาศ']
            : WEATHER_OBSERVATION_FALLBACK_WARNINGS,
          runtimeMode: databaseRead ? 'database' : 'source_api_fallback',
        },
        pagination: { page: page.page, pageSize: page.pageSize, total: 0 },
      });
    }

    const { payload, batches, freshnessDays } = snapshot;
    const start = (page.page - 1) * page.pageSize;
    const stations = payload.stations.slice(start, start + page.pageSize);
    const partialRun = batches.some((batch) => batch.runStatus !== 'succeeded');
    const latest = batches
      .map((batch) => batch.runCompletedAt ?? batch.sourceRetrievedAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()
      .at(-1) ?? null;

    return jsonData({ ...payload, stations }, {
      meta: {
        availability: stations.length ? 'ready' : 'empty',
        freshness: freshness(latest, freshnessDays),
        completeness: completeness(partialRun ? 'partial' : 'succeeded'),
        access: 'approved_public',
        sourceIds: ['tmd', 'open_meteo'],
        dataAsOf: payload.observationDate || null,
        sourceUpdatedAt: latest,
        sourceRetrievedAt: latest,
        datasetVersion: batches[0]?.payloadSha256 ?? batches[0]?.runId ?? 'weather-observations-v1',
        warnings: partialRun
          ? [...WEATHER_OBSERVATION_WARNINGS, 'มีรอบข้อมูลที่สถานะ partial: สถานีต้นทางตอบไม่ครบในรอบนี้']
          : WEATHER_OBSERVATION_WARNINGS,
        runtimeMode: 'database',
      },
      pagination: { page: page.page, pageSize: page.pageSize, total: payload.stations.length },
    });
  });
}
