/// <reference types="vite/client" />
import { Shell } from '@/components/shell';
import {
  NwpDashboard,
  type NwpApiError,
  type NwpApiMeta,
  type NwpGridPayload,
  type NwpProvincesPayload,
  type NwpRunRow,
} from '@/components/nwp-dashboard';
import { REGION_BY_PROVINCE, REGIONS } from '@/lib/hub/weather-data';
import { getProvinces } from '@/lib/provinces';
import { validateThresholds } from '@/lib/hub/nwp-risk';
import { BUNDLED_NWP_THRESHOLDS } from '@/lib/hub/nwp-thresholds';
import type { NwpThresholds } from '@/lib/hub/nwp-types';

/**
 * `/nwp` — TMD HPC NWP grid forecast (lane E).
 *
 * The page is a server component: it loads the first real payload here so the
 * page opens with published numbers instead of placeholders. The interactive
 * parts (variable tabs, lead time, province search/filter) live in the client
 * component `web/components/nwp-dashboard.tsx` and refetch the same public
 * endpoints.
 *
 * Data access: the D1-backed route handlers of `/api/v1/nwp/*` (lane D) are
 * invoked **directly** — no HTTP hop, no absolute URL in a server component.
 * The handlers are resolved with `import.meta.glob`, so the page keeps building
 * while the API lane is still landing, and picks the routes up automatically
 * once they exist. If no handler can be resolved, an explicit base URL from the
 * environment is used as a fallback, and otherwise the page shows an honest
 * error state (never a fake number).
 */

export const metadata = {
  title: 'พยากรณ์กริด NWP เพื่อการเกษตร',
  description:
    'พยากรณ์ฝน อุณหภูมิ และความชื้นจากแบบจำลอง NWP ของกรมอุตุนิยมวิทยา ความละเอียดช่องกริด 0.15° พร้อมรายชื่อจังหวัดที่ควรเฝ้าระวัง — ค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด และไม่ใช่ประกาศเตือนภัยราชการ',
};

/** Forecast payloads must never be frozen into a shared/public HTML cache. */
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ */
/* Route handler access                                                */
/* ------------------------------------------------------------------ */

type NwpRouteHandler = (request: Request) => Promise<Response> | Response;
type NwpRouteModule = { GET?: NwpRouteHandler; get?: NwpRouteHandler };
type NwpRouteLoader = () => Promise<unknown>;

/** Synthetic origin used to build the `Request` handed to a route handler. */
const HANDLER_ORIGIN = 'https://nwp.invalid';

/**
 * Route handlers of `/api/v1/nwp/*` are optional at build time: `import.meta.glob`
 * resolves to an empty map while the API lane has not landed yet, which keeps
 * the build green instead of failing on a missing module.
 */
function routeLoaders(): Record<string, NwpRouteLoader> {
  try {
    const loaders = import.meta.glob('../api/v1/nwp/*/route.ts') as unknown as
      | Record<string, NwpRouteLoader>
      | undefined;
    return loaders ?? {};
  } catch {
    return {};
  }
}

function configuredBaseUrl(): string | null {
  const raw =
    process.env.TADIH_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? null;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed === '' ? null : trimmed;
}

async function invokeHandler(
  segment: string,
  query: string,
): Promise<{ status: number; body: unknown } | null> {
  const loaders = routeLoaders();
  const key = Object.keys(loaders).find((name) => name.endsWith(`/${segment}/route.ts`));
  if (!key) return null;
  const module = (await loaders[key]()) as NwpRouteModule;
  const handler =
    typeof module?.GET === 'function'
      ? module.GET
      : typeof module?.get === 'function'
        ? module.get
        : null;
  if (!handler) return null;
  const response = await handler(new Request(`${HANDLER_ORIGIN}/api/v1/nwp/${segment}${query}`));
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function invokeOverHttp(
  segment: string,
  query: string,
): Promise<{ status: number; body: unknown } | null> {
  const base = configuredBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/api/v1/nwp/${segment}${query}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return null;
  }
}

type ApiResult<T> = { ok: true; data: T; meta: NwpApiMeta } | { ok: false; error: NwpApiError };

async function readNwpApi<T>(segment: string, query: string): Promise<ApiResult<T>> {
  let result: { status: number; body: unknown } | null = null;
  try {
    result = await invokeHandler(segment, query);
  } catch {
    result = null;
  }
  if (!result) result = await invokeOverHttp(segment, query);
  if (!result) {
    return {
      ok: false,
      error: {
        code: 'NWP_API_UNAVAILABLE',
        message:
          'ยังไม่สามารถเรียก API พยากรณ์กริด NWP ได้ (ยังไม่มี route handler ของ /api/v1/nwp และไม่ได้ตั้งค่า URL ของเว็บไซต์)',
        requestId: null,
        status: 503,
      },
    };
  }
  const body = result.body as
    | { data?: unknown; meta?: unknown; error?: { code?: string; message?: string; requestId?: string } }
    | null;
  if (result.status >= 400 || !body || body.data === undefined) {
    const error = body?.error;
    return {
      ok: false,
      error: {
        code: error?.code ?? 'NWP_UNKNOWN_ERROR',
        message: error?.message ?? 'อ่านข้อมูลพยากรณ์กริดไม่สำเร็จ',
        requestId: error?.requestId ?? null,
        status: result.status,
      },
    };
  }
  return { ok: true, data: body.data as T, meta: (body.meta ?? {}) as NwpApiMeta };
}

/* ------------------------------------------------------------------ */
/* Thresholds (internal decision aids, not official warnings)          */
/* ------------------------------------------------------------------ */

/**
 * Thresholds are TADIH's **internal** decision aids, never official warnings.
 *
 * `web/data/nwp-thresholds.json` is the public copy of `config/nwp_thresholds.json`
 * (generated by `scripts/prepare-data.mjs`). It is imported with a guarded glob
 * so a missing file can never break the build; the worker runtime has no file
 * system, therefore the build-time copy that ships inside the bundle
 * (`web/lib/hub/nwp-thresholds.ts`, asserted deep-equal to the config file by
 * `web/tests/nwp-thresholds.test.ts`) is used as the fallback.
 */
async function loadThresholds(): Promise<NwpThresholds | null> {
  try {
    const modules = import.meta.glob('../../data/nwp-thresholds.json', {
      eager: true,
      import: 'default',
    }) as unknown as Record<string, unknown>;
    const raw = Object.values(modules)[0];
    if (raw) {
      try {
        return validateThresholds(raw);
      } catch {
        // Malformed copy -> fall through to the bundled thresholds.
      }
    }
  } catch {
    // No file system / glob unsupported -> fall through to the bundled copy.
  }
  try {
    return validateThresholds(BUNDLED_NWP_THRESHOLDS);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function timeValue(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** `validAt = initAt + lead hours` (UTC ISO, no milliseconds). */
function validAtFrom(initAt: string, leadHours: number): string {
  const base = timeValue(initAt);
  if (!Number.isFinite(base)) return '';
  return new Date(base + leadHours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function defaultVariableFor(run: NwpRunRow | null): string | null {
  if (!run) return null;
  const available = run.variables.filter((variable) => variable !== 'ws10m');
  for (const preferred of ['p24h', 'p1h', 't2m', 'rhum']) {
    if (available.includes(preferred)) return preferred;
  }
  return available[0] ?? null;
}

function leadsForRun(run: NwpRunRow | null, variable: string | null): number[] {
  if (!run || !variable) return [];
  const perVariable = run.leadHoursByVariable?.[variable];
  const source = Array.isArray(perVariable) && perVariable.length > 0 ? perVariable : run.leadHours;
  if (!Array.isArray(source)) return [];
  return source
    .filter((lead): lead is number => typeof lead === 'number' && Number.isFinite(lead))
    .sort((a, b) => a - b);
}

/** Age of the retrieved snapshot — a freshness label, never a data value. */
function ageText(retrievedAt: string): string {
  const ms = timeValue(retrievedAt);
  if (!Number.isFinite(ms)) return 'ไม่ทราบ';
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 0) return 'ยังไม่ถึงเวลาดึงข้อมูล';
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ชั่วโมง ${minutes % 60} นาที`;
  return `${Math.floor(hours / 24)} วัน`;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function NwpPage() {
  const [runsResult, thresholds, provinceReference] = await Promise.all([
    readNwpApi<{ runs: NwpRunRow[] }>('runs', ''),
    loadThresholds(),
    getProvinces(),
  ]);

  const runs = runsResult.ok && Array.isArray(runsResult.data?.runs) ? runsResult.data.runs : [];
  const sortedRuns = [...runs].sort((a, b) => {
    const left = timeValue(b.initAt);
    const right = timeValue(a.initAt);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    return 0;
  });
  const run = sortedRuns[0] ?? null;

  const variable = defaultVariableFor(run);
  const leads = leadsForRun(run, variable);
  const lead = leads.includes(0) ? 0 : (leads[0] ?? null);

  let grid: NwpGridPayload | null = null;
  let provinces: NwpProvincesPayload | null = null;
  let meta: NwpApiMeta | null = null;
  let error: NwpApiError | null = runsResult.ok ? null : runsResult.error;

  if (!error && run && variable && lead !== null) {
    const validAt = validAtFrom(run.initAt, lead);
    const query = `?runId=${encodeURIComponent(run.runId)}&variable=${encodeURIComponent(
      variable,
    )}&validAt=${encodeURIComponent(validAt)}`;
    const gridResult = await readNwpApi<NwpGridPayload>('grid', query);
    if (!gridResult.ok) {
      error = gridResult.error;
    } else {
      grid = gridResult.data;
      meta = gridResult.meta;
      const provinceResult = await readNwpApi<NwpProvincesPayload>('provinces', query);
      if (!provinceResult.ok) {
        error = provinceResult.error;
      } else {
        provinces = provinceResult.data;
      }
    }
  }

  const dataAge = run ? ageText(run.retrievedAt) : 'ไม่ทราบ';

  return (
    <Shell active="nwp">
      <div className="page-heading">
        <div>
          <h1>พยากรณ์กริด NWP เพื่อการเกษตร</h1>
          <p>
            พยากรณ์ฝน อุณหภูมิ และความชื้นจากแบบจำลอง NWP ของกรมอุตุนิยมวิทยา (TMD HPC โดเมน d02)
            ลดขนาดเป็นช่องกริด 0.15° ดูค่าที่พยากรณ์ไว้เป็นช่องกริด พร้อมรายชื่อจังหวัดที่ควรเฝ้าระวัง
            เพื่อประกอบการวางแผนเพาะปลูก เก็บเกี่ยว และเลี้ยงสัตว์
          </p>
        </div>
      </div>

      <NwpDashboard
        runs={sortedRuns}
        regions={REGIONS.map((region) => ({ key: region.key, label: region.label }))}
        provinceRegion={REGION_BY_PROVINCE}
        provinceReferenceCount={provinceReference.length}
        initialVariable={variable}
        initialLead={lead}
        initialGrid={grid}
        initialProvinces={provinces}
        initialMeta={meta}
        initialError={error}
        dataAgeText={dataAge}
        thresholds={thresholds}
      />

      <p className="area-note">
        ค่าทุกจุดบนหน้านี้เป็นค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด และไม่ใช่ประกาศเตือนภัยราชการ
        หน่วยและนิยามตัวแปรยังรอการยืนยันจากต้นทาง TMD · ค่ากริดคือค่าของช่องกริด 0.15° ไม่ใช่ค่าของจังหวัด
        ค่ารายจังหวัดคือค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด ·
        รหัสจังหวัด 77 รายการเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด
        {' · '}
        โปรดตรวจสอบประกาศเตือนภัยฉบับจริงจากหน่วยงานต้นทางก่อนตัดสินใจงานในแปลง
      </p>
    </Shell>
  );
}
