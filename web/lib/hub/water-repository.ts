import 'server-only';
import { queryD1 } from './d1';
import { listD1ObservationRows, D1_OBSERVATION_ROW_LIMIT, type D1ObservationRow } from './d1-numeric-repository';
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
 * Reads the published rows of the RID reservoir resource.
 *
 * The shared reader caps one call at `D1_OBSERVATION_ROW_LIMIT` and a backfilled
 * daily report exceeds that, so pages are followed until one comes back short —
 * asking for the batch total would re-scan the whole resource on every page. The
 * metric split is done in JavaScript because one reservoir is reported as three
 * separate metric rows. Filters are passed as values, never interpolated.
 */
async function listResourceRows(date: string | null): Promise<D1ObservationRow[]> {
  const filters = { resourceId: RID_RESERVOIR_RESOURCE_URL, ...(date ? { from: date, to: date } : {}) };
  const rows: D1ObservationRow[] = [];
  for (let guard = 0; guard < 40; guard += 1) {
    const page = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: rows.length, cache: true });
    rows.push(...page);
    if (page.length < D1_OBSERVATION_ROW_LIMIT) return rows;
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
