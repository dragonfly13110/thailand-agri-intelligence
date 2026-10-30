import 'server-only';
import {
  D1_OBSERVATION_ROW_LIMIT,
  listD1Observations,
  type D1ObservationFilters,
  type D1ObservationRow,
} from './d1-numeric-repository';
import {
  MODIS_NDVI_RESOURCE_ID,
  MODIS_NDVI_SOURCE_ID,
  buildCropEvidenceNdvi,
  emptyCropEvidenceNdvi,
  unavailableCropEvidenceNdvi,
  type CropEvidenceNdviEvidence,
} from './crop-evidence-data';

/**
 * Read side of the MODIS NDVI point evidence for /crop-evidence.
 *
 * Only published rows are visible: `listD1Observations` already gates every row
 * on the resource's `approved_public` + `project_publication_approved` register
 * and on the active `kind='numeric'` run. This module adds no second source, no
 * local snapshot and no sample fallback — if D1 is unreachable the result is
 * `unavailable`, never fabricated values.
 */

/** One read never walks more than this many rows; a capped walk reports partial. */
export const CROP_EVIDENCE_NDVI_ROW_CEILING = 2_000;

export const CROP_EVIDENCE_NDVI_MAX_PAGES = Math.ceil(
  CROP_EVIDENCE_NDVI_ROW_CEILING / D1_OBSERVATION_ROW_LIMIT
);

export type CropEvidenceNdviReader = (
  filters: D1ObservationFilters,
  options: { limit: number; offset: number },
) => Promise<{ rows: D1ObservationRow[]; total: number }>;

const NDVI_FILTERS: D1ObservationFilters = {
  sourceId: MODIS_NDVI_SOURCE_ID,
  resourceId: MODIS_NDVI_RESOURCE_ID,
  // MODIS point samples are written with locations.kind='grid' — filtering on
  // the kind keeps an accidental province/station row out of this evidence.
  locationKind: 'grid',
};

/**
 * Page through the published batch up to `CROP_EVIDENCE_NDVI_ROW_CEILING`.
 * An empty page stops the walk even if `total` disagrees, so a shrinking batch
 * cannot loop forever; `capped` means the warehouse holds more than we read.
 */
async function collectPublishedRows(
  reader: CropEvidenceNdviReader,
): Promise<{ rows: D1ObservationRow[]; capped: boolean }> {
  const rows: D1ObservationRow[] = [];
  let total = 0;
  for (let page = 0; page < CROP_EVIDENCE_NDVI_MAX_PAGES; page += 1) {
    const result = await reader(NDVI_FILTERS, { limit: D1_OBSERVATION_ROW_LIMIT, offset: rows.length });
    total = result.total;
    if (!result.rows.length) break;
    rows.push(...result.rows);
    if (rows.length >= total) break;
  }
  return { rows, capped: rows.length < total };
}

export async function readCropEvidenceNdvi(
  options: { reader?: CropEvidenceNdviReader } = {},
): Promise<CropEvidenceNdviEvidence> {
  const reader = options.reader ?? listD1Observations;
  try {
    const read = await collectPublishedRows(reader);
    if (!read.rows.length) return emptyCropEvidenceNdvi();
    return buildCropEvidenceNdvi(read.rows, { capped: read.capped });
  } catch {
    // A D1 failure must surface as `unavailable` — never as sample values.
    return unavailableCropEvidenceNdvi();
  }
}
