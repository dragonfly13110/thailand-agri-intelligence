/**
 * Shared contract for the province benchmark tool at `/areas/compare`.
 *
 * Client-safe on purpose: the server page and the client components both import
 * these types, so nothing in this file may import `server-only` modules or read
 * local files.
 *
 * Truth rules for this feature (see AGENTS.md and SYSTEM_DESIGN.md):
 * - `/api/v1/weather` returns no rain values until an approved forecast batch
 *   exists. An empty cumulative value is unavailable data, not zero rainfall.
 * - Water values are RID medium-reservoir aggregates at REGION grain, not
 *   province grain. RID uses six regions (it splits ภาคตะวันตก) while the
 *   weather payload uses five, so a row is matched by exact region label only.
 *   No silent mapping is allowed.
 * - Crop and soil references are national / regional reference documents. The
 *   Hub has no province-level crop or soil coverage yet; a missing value stays
 *   null or an explicit "no province data" state, never a borrowed value.
 */

export const COMPARE_MIN_PROVINCES = 2;
export const COMPARE_MAX_PROVINCES = 3;

export type ProvinceOption = {
  code: string;
  name: string;
  /** Weather region key (`north`, `central`, …); a reference grouping only. */
  regionKey: string;
  /** Thai region label used to match RID region rows and LDD soil series. */
  regionLabel: string;
};

export type RainStatus = 'below_normal' | 'normal' | 'above_normal' | 'unknown';

export type WeatherSnapshot = {
  issuedAt: string | null;
  regionLabel: string;
  /** True only when values are explicitly sample data. */
  sample: boolean;
  warnings: string[];
  cumulative: {
    windowDays: number;
    daysWithData: number;
    missingDays: number;
    forecastTotalMm: number | null;
    normalTotalMm: number;
    anomalyPercent: number | null;
    status: RainStatus;
    completeness: 'complete' | 'partial';
    dryDays: number;
    heavyRainDays: number;
  } | null;
  advisories: Array<{
    code: string;
    severity: 'high' | 'medium' | 'low';
    titleTh: string;
  }>;
};

/** One RID region row, or an explicit no-match state. Never province grain. */
export type WaterSnapshot = {
  grain: 'region' | 'none';
  ridRegion: string | null;
  percent: number | null;
  volumeMcm: number | null;
  storageMcm: number | null;
  reservoirCount: number | null;
  reportDate: string | null;
  sourceLabel: string;
  sourceUrl: string;
  /** Reason the province could not be matched to one RID region row. */
  note: string | null;
};

export type SoilSnapshot = {
  scope: 'region' | 'none';
  regionLabel: string | null;
  items: Array<{
    id: string;
    code: string;
    name: string;
    groupNumber: number;
    phNote: string;
    textureTop: string;
  }>;
  /** Explains that a soil series is not a province boundary / coverage claim. */
  note: string | null;
};

export type CropReference = {
  id: string;
  label: string;
  profileNames: string[];
};

export type Loadable<T> =
  | { phase: 'loading'; data: null; message: null }
  | { phase: 'ready'; data: T; message: null }
  | { phase: 'error'; data: null; message: string };

export type CompareProvince = {
  code: string;
  name: string;
  regionLabel: string;
  weather: Loadable<WeatherSnapshot>;
  water: Loadable<WaterSnapshot>;
  soil: Loadable<SoilSnapshot>;
};

export type CompareShared = {
  /** National reference only; shown once for every selected province. */
  crops: Loadable<CropReference[]>;
};

export type RidRegionRow = {
  region: string;
  count: number;
  storageMcm: number;
  volumeMcm: number;
  percent: number;
};

/**
 * Exact-label match against the RID summary. Returning null is deliberate:
 * falling back to the national average or to ภาคกลาง would invent a province
 * value the API does not have.
 */
export function findExactRidRegion(rows: RidRegionRow[], regionLabel: string | null): RidRegionRow | null {
  if (!regionLabel) return null;
  return rows.find((row) => row.region === regionLabel) ?? null;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'ไม่ทราบ';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'ไม่ทราบ';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value) + '%';
}

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso + 'T00:00:00+07:00'))) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })
    .format(new Date(iso + 'T00:00:00+07:00'));
}
