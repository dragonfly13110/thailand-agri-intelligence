import 'server-only';
import { queryD1 } from './d1';
import { listD1Observations, D1_OBSERVATION_ROW_LIMIT, type D1ObservationRow } from './d1-numeric-repository';
import {
  ERA5_RESOURCE_URL,
  TMD_STATION_RESOURCES,
  buildWeatherObservations,
  type WeatherObservationsPayload,
} from './weather-observations-data';

/** One published batch that contributed rows to the payload. */
export type WeatherBatchProvenance = {
  resourceUrl: string;
  network: string;
  label: string;
  runId: string | null;
  runStatus: string | null;
  adapterVersion: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  runCompletedAt: string | null;
  observationRows: number;
};

export type WeatherSnapshot = {
  payload: WeatherObservationsPayload | null;
  batches: WeatherBatchProvenance[];
  /** `sources.freshness_days` when every weather source agrees; otherwise null. */
  freshnessDays: number | null;
  observationRows: number;
};

const RESOURCE_ENTRIES: [string, { network: string; label: string }][] = [
  ...TMD_STATION_RESOURCES.map((row): [string, { network: string; label: string }] =>
    [row.resourceUrl, { network: row.network, label: row.label }]),
  [ERA5_RESOURCE_URL, { network: 'reanalysis', label: 'Open-Meteo ERA5 reanalysis (จังหวัดที่มีจุดกริดในคลัง)' }],
];

const RESOURCE_META = new Map<string, { network: string; label: string }>(RESOURCE_ENTRIES);

/**
 * Collect every published row of one weather resource.
 *
 * Two guards shape this loop. The shared reader caps a call at
 * `D1_OBSERVATION_ROW_LIMIT`, so pages are followed until the reported total is
 * collected, and an empty page stops the walk even if the total disagrees. The
 * metric split and the province match are done in JavaScript because the reader's
 * `metricId`/`provinceCode` filters reject ids containing `_` (defect #7) and
 * because the province of a TMD station row lives in `dimensions`, never in
 * `observations.province_code`. Filters are passed as values, never interpolated.
 */
async function listResourceRows(resourceUrl: string): Promise<D1ObservationRow[]> {
  const rows: D1ObservationRow[] = [];
  let offset = 0;
  for (let guard = 0; guard < 40; guard += 1) {
    const batch = await listD1Observations({ resourceId: resourceUrl }, { limit: D1_OBSERVATION_ROW_LIMIT, offset });
    rows.push(...batch.rows);
    offset += batch.rows.length;
    if (!batch.rows.length || offset >= batch.total) return rows;
  }
  return rows;
}

/** Freshness agreement across the weather sources; a mixed cadence is not labelable. */
async function readFreshnessDays(): Promise<number | null> {
  const resourceUrls = [...RESOURCE_META.keys()];
  const placeholders = resourceUrls.map(() => '?').join(', ');
  const rows = await queryD1<{ freshnessDays: unknown }>(
    'SELECT DISTINCT s.freshness_days AS freshnessDays FROM resources r ' +
      'JOIN datasets d ON d.dataset_id=r.dataset_id JOIN sources s ON s.source_id=d.source_id ' +
      `WHERE r.resource_id IN (${placeholders})`,
    resourceUrls
  );
  const values = new Set(rows.map((row) => Number(row.freshnessDays)).filter((value) => Number.isFinite(value)));
  return values.size === 1 ? [...values][0] : null;
}

function toBatch(resourceUrl: string, rows: D1ObservationRow[]): WeatherBatchProvenance {
  const meta = RESOURCE_META.get(resourceUrl) ?? { network: 'unknown', label: resourceUrl };
  const [first] = rows;
  return {
    resourceUrl,
    network: meta.network,
    label: meta.label,
    runId: first?.runId ?? null,
    runStatus: first?.runStatus ?? null,
    adapterVersion: first?.adapterVersion ?? null,
    payloadSha256: first?.payloadSha256 ?? null,
    sourceRetrievedAt: first?.sourceRetrievedAt ?? null,
    runCompletedAt: first?.runCompletedAt ?? null,
    observationRows: rows.length,
  };
}

/**
 * Load the active numeric weather batches and pivot them into station records.
 *
 * Returns an empty `batches` list and `payload: null` (never an empty numeric
 * body) when D1 holds no approved published weather rows, so the caller answers
 * the metadata-only contract. Each resource keeps its own run provenance because
 * one payload can be built from several independent numeric runs.
 */
export async function readWeatherSnapshot(
  options: { provinceCode?: string | null; date?: string | null } = {}
): Promise<WeatherSnapshot> {
  const provinceCode = options.provinceCode ?? null;
  const date = options.date ?? null;

  const resourceUrls = [...RESOURCE_META.keys()];
  const perResource = await Promise.all(resourceUrls.map(async (url) => [url, await listResourceRows(url)] as const));
  const batches = perResource
    .map(([url, rows]) => toBatch(url, rows))
    .filter((batch) => batch.observationRows > 0);
  const rows = perResource.flatMap(([, resourceRows]) => resourceRows);

  const scoped = date ? rows.filter((row) => (row.periodStart ?? row.periodEnd) === date) : rows;
  if (!scoped.length) return { payload: null, batches: [], freshnessDays: null, observationRows: 0 };

  const payload = buildWeatherObservations(scoped, { provinceCode });
  if (!payload) return { payload: null, batches: [], freshnessDays: null, observationRows: 0 };

  return { payload, batches, freshnessDays: await readFreshnessDays(), observationRows: rows.length };
}
