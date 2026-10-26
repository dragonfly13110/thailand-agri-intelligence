import { completeness, freshness, handleApi, jsonData, parseDate, parsePage } from '../../../../../lib/hub/http';
import { readWaterSnapshot, type WaterSnapshot } from '../../../../../lib/hub/water-repository';
import {
  WATER_FALLBACK_WARNINGS,
  WATER_WARNINGS,
  buildWaterMetadataPayload,
} from '../../../../../lib/hub/water-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/water/reservoirs
 *
 * Serves the RID medium-reservoir daily report from the hub's active numeric
 * batch. A reservoir row is only published when its resource is
 * `approved_public` + `project_publication_approved` and its run is
 * `kind='numeric'` with status succeeded/partial — that filter lives in
 * `d1-numeric-repository` and cannot be switched off from here.
 *
 * When D1 cannot be read, or holds no published batch for this resource, the
 * route answers the metadata-only envelope (`availability/access =
 * metadata_only`, `reservoirs: []`, `summary: null`) so an empty result is
 * never readable as "no water".
 *
 * Query: `page`, `pageSize`, optional `date=YYYY-MM-DD` to pin one report date.
 * Grain is reservoir × report_date; province rollups are not available.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const page = parsePage(url);
    const date = parseDate(url, 'date');

    // Three honest outcomes: the database could not be read, it holds no
    // publishable batch for this resource/date, or it returned real numbers.
    let snapshot: WaterSnapshot | null = null;
    let databaseRead = false;
    try {
      snapshot = await readWaterSnapshot({ date });
      databaseRead = true;
    } catch (error) {
      // A failing read must never look like "no water", but it must not be
      // invisible either: the reason belongs in the server log.
      console.warn('[water] reservoir read failed', error instanceof Error ? error.message : String(error));
    }

    if (!snapshot?.payload) {
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
          warnings: databaseRead
            ? [...WATER_FALLBACK_WARNINGS, date
                ? `อ่านคลังข้อมูลกลางสำเร็จ แต่ไม่มีแถวที่เผยแพร่ได้สำหรับวันที่ ${date}`
                : 'อ่านคลังข้อมูลกลางสำเร็จ แต่ไม่มี active numeric batch ของทรัพยากรนี้']
            : WATER_FALLBACK_WARNINGS,
          runtimeMode: databaseRead ? 'database' : 'source_api_fallback',
        },
        pagination: { page: page.page, pageSize: page.pageSize, total: 0 },
      });
    }

    const { payload, provenance } = snapshot;
    const start = (page.page - 1) * page.pageSize;
    const reservoirs = payload.reservoirs.slice(start, start + page.pageSize);
    const partial = provenance.runStatus !== 'succeeded';

    return jsonData({ ...payload, reservoirs }, {
      meta: {
        availability: reservoirs.length ? 'ready' : 'empty',
        freshness: freshness(provenance.sourceUpdatedAt ?? provenance.sourceRetrievedAt, provenance.freshnessDays),
        completeness: completeness(provenance.runStatus),
        access: 'approved_public',
        sourceIds: ['rid'],
        dataAsOf: payload.summary?.reportDate ?? null,
        sourceUpdatedAt: provenance.sourceUpdatedAt,
        sourceRetrievedAt: provenance.sourceRetrievedAt,
        datasetVersion: provenance.payloadSha256 ?? provenance.runId,
        warnings: partial
          ? [...WATER_WARNINGS, 'รอบข้อมูลที่อ่านได้มีสถานะ partial: ต้นทางตอบไม่ครบทุกอ่างในรอบนี้']
          : WATER_WARNINGS,
        runtimeMode: 'database',
      },
      pagination: { page: page.page, pageSize: page.pageSize, total: payload.reservoirs.length },
    });
  });
}
