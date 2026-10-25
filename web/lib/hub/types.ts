export type AccessStatus = 'approved_public' | 'metadata_only';
export type Availability = 'ready' | 'empty' | 'metadata_only' | 'unavailable';
export type Freshness = 'fresh' | 'stale' | 'unknown';
export type Completeness = 'complete' | 'partial' | 'unknown';

export type ApiMeta = {
  availability: Availability;
  freshness: Freshness;
  completeness: Completeness;
  access: AccessStatus;
  sourceIds: string[];
  retrievedAt: string | null;
  sourceRetrievedAt?: string | null;
  dataAsOf: string | null;
  sourceUpdatedAt: string | null;
  datasetVersion: string | null;
  warnings: string[];
  runtimeMode: 'database' | 'source_api_fallback';
};

export type Pagination = { page: number; pageSize: number; total: number };
export type ApiResponse<T> = { data: T; meta: ApiMeta; pagination?: Pagination };
export type ApiError = { error: { code: string; message: string; requestId: string } };

export type HubSource = {
  id: string;
  name: string;
  baseUrl: string;
  status: 'enabled' | 'deferred' | 'needs_access' | 'unavailable';
  lastSuccessAt: string | null;
};

export type DatasetSummary = {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  category: string | null;
  owner: string | null;
  sourceUrl: string;
  modifiedAt: string | null;
  resourceCount: number | null;
  availability: 'ready' | 'empty' | 'metadata_only';
  freshness: Freshness;
  access: 'approved_public' | 'metadata_only';
};

export type HubResource = {
  id: string;
  sourceResourceId: string;
  name: string;
  format: string | null;
  accessStatus: AccessStatus;
  declaredLicense: string | null;
  licenseUrl: string | null;
  projectPublicationApproved: boolean;
  grain: string | null;
  activeRunId: string | null;
  lastSuccessAt: string | null;
  dataAsOf: string | null;
};

export type DatasetDetail = DatasetSummary & {
  sourceDatasetId: string;
  resources: HubResource[];
};

export type HubObservation = {
  rowKey: string;
  seriesId: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  locationCode: string | null;
  locationKind: string | null;
  locationName: string | null;
  provinceCode: string | null;
  cropCode: string | null;
  cropName: string | null;
  metricId: string | null;
  metricName: string | null;
  product: string | null;
  grade: string | null;
  market: string | null;
  unit: string | null;
  value: number | null;
  dimensions: Record<string, string | number | boolean | null>;
  qualityStatus: string;
  sourceRowRef: string | null;
};

export type HubSeries = {
  id: string;
  resourceId: string;
  product: string | null;
  grade: string | null;
  market: string | null;
  unit: string | null;
  metricId: string | null;
  metricName: string | null;
  cropName: string | null;
  observationCount: number;
  from: string | null;
  to: string | null;
};

export type SourceRun = {
  runId: string;
  kind: 'metadata' | 'numeric';
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string | null;
  recordsRead: number;
  recordsWritten: number;
  errorCode: string | null;
};

export type SourceStatus = HubSource & {
  latestStatus: SourceRun['status'] | null;
  recentRuns: SourceRun[];
};

export type AreaEvidence = {
  datasetId: string;
  title: string;
  sourceId: string;
  sourceName: string;
  category: string | null;
  evidenceCount: number;
  grain: string | null;
  dataAsOf: string | null;
  lastSuccessAt: string | null;
};
