/**
 * TMD HPC NWP shared contract (lane D).
 *
 * Product: forecast grids from `hpc.tmd.go.th` domain `d02` (Thailand 3 km),
 * downsampled to 0.15° blocks for `/nwp` and `/api/v1/nwp/*`.
 *
 * This module is deliberately free of `server-only` so client components and
 * route handlers can both import it. It only holds types and frozen contract
 * constants; every number shape below matches
 * `docs/assignments/2026-10-26-tmd-hpc-nwp-integration.md` §3–§4 exactly.
 *
 * Governance (must not be relaxed here):
 * - Values are model forecasts, never observations.
 * - `unit` stays `null` / `unitStatus: 'pending_official_confirmation'` until
 *   TMD documentation confirms definitions; `licenseStatus` stays `pending`.
 * - A grid cell is not a province value and never an official warning.
 */

/* ------------------------------------------------------------------ */
/* Variables                                                           */
/* ------------------------------------------------------------------ */

/** The only variables v1 may ingest, in API/UI order. Allowlist, not a sample list. */
export const NWP_VARIABLES = ['p1h', 'p24h', 't2m', 'rhum', 'ws10m'] as const;

export type NwpVariable = (typeof NWP_VARIABLES)[number];

export const NWP_VARIABLE_LABELS_TH: Record<NwpVariable, string> = {
  p1h: 'ฝน 1 ชม.',
  p24h: 'ฝน 24 ชม.',
  t2m: 'อุณหภูมิ 2 ม.',
  rhum: 'ความชื้นสัมพัทธ์',
  ws10m: 'ลม 10 ม.',
};

/**
 * Source units are NOT confirmed yet, so every entry is `null`.
 * Never widen this into guessed units ("mm", "degC", …): the API `unit` field
 * and this map must stay `null` until the official TMD definition is checked.
 */
export const NWP_VARIABLE_UNITS_PENDING: Record<NwpVariable, string | null> = {
  p1h: null,
  p24h: null,
  t2m: null,
  rhum: null,
  ws10m: null,
};

export function isNwpVariable(value: unknown): value is NwpVariable {
  return typeof value === 'string' && (NWP_VARIABLES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Risk levels (TADIH internal thresholds)                             */
/* ------------------------------------------------------------------ */

export type RiskLevel = 'normal' | 'watch' | 'high' | 'severe';

export const RISK_LEVELS: readonly RiskLevel[] = ['normal', 'watch', 'high', 'severe'];

/** Ascending severity; higher wins when merging advisories. Unknown/null sorts last. */
export const RISK_LEVEL_RANK: Record<RiskLevel, number> = {
  normal: 0,
  watch: 1,
  high: 2,
  severe: 3,
};

export const RISK_LABELS_TH: Record<RiskLevel, string> = {
  normal: 'ปกติ',
  watch: 'เฝ้าระวัง',
  high: 'เสี่ยงสูง',
  severe: 'เสี่ยงสูงมาก',
};

/* ------------------------------------------------------------------ */
/* Grid geometry                                                       */
/* ------------------------------------------------------------------ */

export type NwpBbox = [number, number, number, number];

export type NwpGridGeometry = {
  bbox: NwpBbox;
  nx: number;
  ny: number;
  cellDeg: number;
};

/**
 * Output grid, fixed for dataset v1.
 * bbox = [lon_min, lat_min, lon_max, lat_max] = [96, 5, 106, 21] (lon/lat, WGS84).
 * 66.67 full columns and 106.67 full rows fit in the bbox, so the last column
 * (east edge) and last row (south edge) are partial blocks: nx = 67, ny = 107.
 */
export const NWP_GRID: NwpGridGeometry = {
  bbox: [96.0, 5.0, 106.0, 21.0],
  nx: 67,
  ny: 107,
  cellDeg: 0.15,
};

export const NWP_GRID_CELLS = NWP_GRID.nx * NWP_GRID.ny; // 7169

/**
 * Payload orientation. Lane E (heatmap) and every consumer MUST use this rule:
 * arrays are row-major over the bbox; row 0 is the NORTH edge (lat_max = 21),
 * column 0 is the WEST edge (lon_min = 96); index = row * nx + col.
 * Do not flip the vertical axis in the SVG coordinate system.
 */
export const NWP_GRID_ORIENTATION =
  'row-major; row 0 = north (lat_max), col 0 = west (lon_min)';

export const NWP_GRID_INDEX_RULE = 'index = row * nx + col';

/* ------------------------------------------------------------------ */
/* Runs                                                                */
/* ------------------------------------------------------------------ */

export type NwpRunStatus = 'ready' | 'partial' | 'failed';
export type NwpPublicationMode = 'numeric_preview' | 'metadata_only';

/** `GET /api/v1/nwp/runs` row (work order §4.1), camelCase on the wire. */
export type NwpRun = {
  runId: string;
  initAt: string;
  retrievedAt: string;
  domain: string;
  domainLabel: string;
  variables: NwpVariable[];
  leadHours: number[];
  status: NwpRunStatus;
  licenseStatus: string;
  unitStatus: string;
  publicationMode: NwpPublicationMode;
};

/* ------------------------------------------------------------------ */
/* Grid payload                                                        */
/* ------------------------------------------------------------------ */

/**
 * `GET /api/v1/nwp/grid` data block (work order §4.2).
 * `mean` / `max` are row-major and exactly `nx * ny` long; `null` = no source
 * cell in that block. Never substitute 0 for missing and never interpolate.
 * `unit` stays `null` until TMD confirms units.
 */
export type NwpGridResponse = {
  runId: string;
  variable: NwpVariable;
  validAt: string;
  bbox: NwpBbox;
  nx: number;
  ny: number;
  mean: (number | null)[];
  max: (number | null)[];
  unit: string | null;
  method: string;
};

/* ------------------------------------------------------------------ */
/* Province watchlist                                                  */
/* ------------------------------------------------------------------ */

/**
 * One province row (work order §4.3).
 * `value` is the max block max inside `radiusKm` of the province reference
 * point — NOT a province average and NOT a 77-code coverage claim. When no cell
 * falls inside the radius, the aggregator falls back to `nearest_cell` and
 * keeps `distanceKm` honest.
 */
export type NwpProvinceRow = {
  provinceCode: string;
  provinceName: string;
  value: number | null;
  riskLevel: RiskLevel | null;
  distanceKm: number | null;
  cellCount: number;
};

export type NwpProvincesResponse = {
  runId: string;
  variable: NwpVariable;
  validAt: string;
  method: string;
  radiusKm: number;
  provinces: NwpProvinceRow[];
};

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

export type NwpThresholdDefinition = {
  unit: string;
  watch: number;
  high: number;
  severe: number;
};

/** Mirrors `config/nwp_thresholds.json` (work order §3.7); internal, not official. */
export type NwpThresholds = {
  version: number;
  source: string;
  variables: Record<NwpVariable, NwpThresholdDefinition>;
};

/* ------------------------------------------------------------------ */
/* Contract constants                                                  */
/* ------------------------------------------------------------------ */

export const NWP_DATASET_VERSION = 'tmd-hpc-d02-v1';
export const NWP_SOURCE_ID = 'tmd_hpc_nwp';
export const NWP_DOMAIN = 'd02';
export const NWP_DOMAIN_LABEL = 'Thailand 3km';

/** Downsampling method recorded in grid payloads. */
export const NWP_METHOD_GRID = 'block_mean_0.15deg';
/** Province aggregation method: max of block max within 25 km of the reference point. */
export const NWP_METHOD_PROVINCE = 'max_within_25km';
/** Used only when no cell falls inside the radius. */
export const NWP_METHOD_PROVINCE_FALLBACK = 'nearest_cell';
export const NWP_PROVINCE_RADIUS_KM = 25;

/** run_id: `tmd_hpc_d02_YYYYMMDDHH`; constrain query params with this exact regex. */
export const NWP_RUN_ID_PATTERN = '^[a-z0-9_]{8,80}$';

/**
 * Lead-time buttons shown by the UI (work order §2.2). This is a control
 * affordance only — the authoritative list of a run is `NwpRun.leadHours`, and
 * `validAt` must be derived from `initAt + lead`, never from this constant.
 */
export const NWP_LEAD_HOURS: number[] = [0, 6, 12, 24, 48, 72];

/**
 * Meta warnings that every NWP payload must carry (Thai). Treat as immutable and
 * copy into `meta.warnings`; do not drop any of the four governance points.
 */
export const NWP_WARNINGS: string[] = [
  'ค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด',
  'หน่วยและนิยามตัวแปรยังรอการยืนยันจากต้นทาง TMD',
  'ค่ากริดคือค่าของช่องกริด 0.15° ไม่ใช่ค่าของจังหวัด',
  'ไม่ใช่ประกาศเตือนภัยราชการ ใช้ประกอบการวางแผนเท่านั้น',
];
