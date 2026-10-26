import 'server-only';
import { queryD1 } from './d1';
import { listD1Observations, D1_OBSERVATION_ROW_LIMIT, type D1ObservationRow } from './d1-numeric-repository';
import { RID_RESERVOIR_RESOURCE_URL, buildWaterPayload, type WaterPayload } from './water-data';

/** Run-level provenance of the active numeric batch that produced the rows. */
export type WaterRunProvenance = {
  runId: string | null;
  runStatus: string | null;
  adapterVersion: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  sourceUpdatedAt: string | null;
  freshnessDays: number | null;
  observationRows: number;
};

export type WaterSnapshot = {
  payload: WaterPayload | null;
  provenance: WaterRunProvenance;
};

const EMPTY_PROVENANCE: WaterRunProvenance = {
  runId: null,
  runStatus: null,
  adapterVersion: null,
  payloadSha256: null,
  sourceRetrievedAt: null,
  sourceUpdatedAt: null,
  freshnessDays: null,
  observationRows: 0,
};

/**
 * Reads every published row of the RID reservoir resource.
 *
 * The shared reader caps one call at `D1_OBSERVATION_ROW_LIMIT`, and a backfilled
 * daily report exceeds that, so the pages are followed until the reported total
 * is collected. The metric split is done in JavaScript: the reader's `metricId`
 * filter rejects ids containing `_` (a LIKE wildcard guard), which would reject
 * `reservoir_volume` itself. Filters are passed as values, never interpolated.
 */
async function listResourceRows(date: string | null): Promise<D1ObservationRow[]> {
  const rows: D1ObservationRow[] = [];
  let offset = 0;
  for (let guard = 0; guard < 40; guard += 1) {
    const batch = await listD1Observations(
      { resourceId: RID_RESERVOIR_RESOURCE_URL, ...(date ? { from: date, to: date } : {}) },
      { limit: D1_OBSERVATION_ROW_LIMIT, offset }
    );
    rows.push(...batch.rows);
    offset += batch.rows.length;
    if (!batch.rows.length || offset >= batch.total) return rows;
  }
  return rows;
}

async function readResourceContext(): Promise<{ sourceUpdatedAt: string | null; freshnessDays: number | null }> {
  const rows = await queryD1<{ sourceUpdatedAt: unknown; freshnessDays: unknown }>(
    'SELECT r.source_updated_at AS sourceUpdatedAt,s.freshness_days AS freshnessDays ' +
      'FROM resources r JOIN datasets d ON d.dataset_id=r.dataset_id ' +
      'JOIN sources s ON s.source_id=d.source_id WHERE r.resource_id=? LIMIT 1',
    [RID_RESERVOIR_RESOURCE_URL]
  );
  const row = rows[0];
  const freshnessDays = Number(row?.freshnessDays);
  return {
    sourceUpdatedAt: typeof row?.sourceUpdatedAt === 'string' ? row.sourceUpdatedAt : null,
    freshnessDays: Number.isFinite(freshnessDays) ? freshnessDays : null,
  };
}

/**
 * Loads the active RID numeric batch and pivots it into reservoir records.
 *
 * Returns `payload: null` (never a zeroed summary) when the database has no
 * approved, published rows for this resource so the caller can fall back to the
 * metadata-only contract.
 */
export async function readWaterSnapshot(options: { date?: string | null } = {}): Promise<WaterSnapshot> {
  const date = options.date ?? null;
  const [rows, context] = await Promise.all([listResourceRows(date), readResourceContext()]);
  const payload = buildWaterPayload(rows);
  if (!payload) return { payload: null, provenance: { ...EMPTY_PROVENANCE } };

  const [first] = rows;
  return {
    payload,
    provenance: {
      runId: first?.runId ?? null,
      runStatus: first?.runStatus ?? null,
      adapterVersion: first?.adapterVersion ?? null,
      payloadSha256: first?.payloadSha256 ?? null,
      sourceRetrievedAt: first?.sourceRetrievedAt ?? null,
      sourceUpdatedAt: context.sourceUpdatedAt,
      freshnessDays: context.freshnessDays,
      observationRows: rows.length,
    },
  };
}
