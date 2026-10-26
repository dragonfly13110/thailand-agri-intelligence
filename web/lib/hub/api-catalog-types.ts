/**
 * Shared types for the Hub API v1 developer portal.
 *
 * The catalog is documentation data only. It never imports a server-only
 * repository, so the page, the playground and the snippet generator can all
 * render from the same source of truth in the browser.
 */

export type ApiGroupId =
  | 'sources'
  | 'datasets'
  | 'weather'
  | 'water'
  | 'nwp'
  | 'crops'
  | 'soil'
  | 'areas'
  | 'prices';

/**
 * `approved_public` — ตัวเลขที่ส่งออกได้เฉพาะ active batch ที่อนุมัติแล้ว
 * `metadata_only`  — metadata หรือข้อมูลอ้างอิงที่ไม่ได้เป็น observation ในคลังกลาง
 * `pending`        — endpoint คืน snapshot ตัวเลขที่สถานะสิทธิ์ยังไม่ยืนยัน ห้ามอ้างว่าอนุมัติแล้ว
 */
export type ApiAccess = 'approved_public' | 'metadata_only' | 'pending';

/**
 * `hub-v1` — ใช้ envelope { data, meta, pagination } ตาม
 *            data_contracts/hub-api.schema.json
 * `domain`  — endpoint เฉพาะแดชบอร์ดที่คืน shape ของโดเมนเอง (ไม่มี meta ตามสัญญา)
 */
export type ApiContract = 'hub-v1' | 'domain';

export type ApiParamType = 'string' | 'integer' | 'date' | 'enum';

export interface ApiQueryParam {
  name: string;
  type: ApiParamType;
  description: string;
  /** Prefilled value in the playground; omit for an empty field. */
  example?: string;
  /** Allowed values when `type` is `enum`. */
  values?: string[];
  minimum?: number;
  maximum?: number;
}

export interface ApiPathParam {
  name: string;
  description: string;
  example: string;
  /** Optional live lookup the playground can use to fill a real id. */
  suggest?: 'dataset' | 'series' | 'source';
  pattern?: string;
}

export interface ApiEndpoint {
  /** Stable anchor, e.g. `datasets-records`; also used by `?endpoint=`. */
  id: string;
  group: ApiGroupId;
  method: 'GET';
  /** Path template with `{param}` placeholders, e.g. `/api/v1/datasets/{id}`. */
  path: string;
  title: string;
  description: string;
  access: ApiAccess;
  contract: ApiContract;
  /** Human-readable response envelope, e.g. `ApiResponse<DatasetSummary[]>`. */
  responseType: string;
  query?: ApiQueryParam[];
  pathParams?: ApiPathParam[];
  /** Caveats shown under the endpoint in the catalog and playground. */
  notes?: string[];
}

export interface ApiGroup {
  id: ApiGroupId;
  label: string;
  description: string;
}
