/// <reference types="vite/client" />
import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { EarlyWarningDashboard } from '@/components/early-warning-dashboard';
import type { NwpProvincesPayload, NwpRunRow } from '@/components/nwp-dashboard';
import { buildEarlyWarningDataset } from '@/lib/hub/early-warning-data';
import {
  buildEarlyWarningNwpForecast,
  type EarlyWarningNwpForecast,
} from '@/lib/hub/early-warning-nwp';

export const metadata: Metadata = {
  title: 'เตือนภัยน้ำท่วมและภัยแล้งเพื่อการเกษตร | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'สัญญาณเตือนภัยตั้งต้นจากข้อมูลตรวจวัดที่เผยแพร่ในคลังข้อมูลกลาง: ระดับน้ำอ่างเก็บน้ำ RID, polygon น้ำท่วม GISTDA (Sentinel-1 C-SAR) และค่ารายสถานีกรมอุตุนิยมวิทยา พร้อมดัชนีความเสี่ยงรายจังหวัดและคำแนะนำเชิงเกษตร — ระดับความเสี่ยงเป็นดัชนีวิเคราะห์ภายในของ TADIH ไม่ใช่ประกาศเขตพื้นที่ประสบสาธารณภัยของทางราชการ',
};

// The page reads whichever numeric batch is currently published, so the HTML
// must never be frozen into a shared/public cache.
export const dynamic = 'force-dynamic';

const HANDLER_ORIGIN = 'https://early-warning.invalid';

type NwpRouteHandler = (request: Request) => Promise<Response> | Response;
type NwpRouteLoader = () => Promise<{ GET?: NwpRouteHandler; get?: NwpRouteHandler } | undefined>;

/**
 * The real 72 h forecast reuses the public `/api/v1/nwp/*` handlers directly so
 * this page never hardcodes a second copy of the forecast numbers.
 */
async function readNwpApi<T>(segment: string, query: string): Promise<T | null> {
  try {
    const loaders = import.meta.glob('../api/v1/nwp/*/route.ts') as unknown as
      | Record<string, NwpRouteLoader>
      | undefined;
    const key = Object.keys(loaders ?? {}).find((name) => name.endsWith(`/${segment}/route.ts`));
    if (!key) return null;
    const module = await loaders![key]();
    const handler =
      typeof module?.GET === 'function'
        ? module.GET
        : typeof module?.get === 'function'
          ? module.get
          : null;
    if (!handler) return null;
    const response = await handler(new Request(`${HANDLER_ORIGIN}/api/v1/nwp/${segment}${query}`));
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { data?: T } | null;
    return body?.data ?? null;
  } catch {
    return null;
  }
}

function validAtFrom(initAt: string, leadHours: number): string | null {
  const base = Date.parse(initAt);
  if (!Number.isFinite(base)) return null;
  return new Date(base + leadHours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function loadRealNwpForecast(): Promise<EarlyWarningNwpForecast | null> {
  const runsPayload = await readNwpApi<{ runs: NwpRunRow[] }>('runs', '');
  const runs = Array.isArray(runsPayload?.runs) ? runsPayload.runs : [];
  const run = [...runs]
    .filter((row) => row.variables?.includes('p24h'))
    .sort((a, b) => Date.parse(b.initAt) - Date.parse(a.initAt))[0];
  if (!run) return null;

  const allLeads = run.leadHoursByVariable?.p24h ?? run.leadHours;
  const leads = (Array.isArray(allLeads) ? allLeads : []).filter(
    (lead): lead is number => typeof lead === 'number' && Number.isFinite(lead) && lead > 0,
  );
  const daily = leads.filter((lead) => lead % 24 === 0);
  const selected = (daily.length > 0 ? daily : leads).slice(-3);

  const payloads: NwpProvincesPayload[] = [];
  for (const lead of selected) {
    const validAt = validAtFrom(run.initAt, lead);
    if (!validAt) continue;
    const query = `?runId=${encodeURIComponent(run.runId)}&variable=p24h&validAt=${encodeURIComponent(validAt)}`;
    const payload = await readNwpApi<NwpProvincesPayload>('provinces', query);
    if (payload) payloads.push(payload);
  }

  return buildEarlyWarningNwpForecast(run, payloads);
}

export default async function EarlyWarningPage() {
  const [dataset, realForecast] = await Promise.all([
    buildEarlyWarningDataset(),
    loadRealNwpForecast(),
  ]);

  return (
    <Shell active="early-warning">
      <EarlyWarningDashboard
        initialSummary={dataset.summary}
        initialProvinces={dataset.provinces}
        initialForecast={dataset.forecast14Days}
        initialCriticalReservoirs={dataset.criticalReservoirs}
        initialSignals={dataset.signals}
        initialSources={dataset.sources}
        mode={dataset.mode}
        bannerText={dataset.bannerText}
        disclaimer={dataset.disclaimer}
        warnings={dataset.apiMeta.warnings}
        layerGovernance={dataset.layerGovernance}
        realForecast={realForecast}
      />
    </Shell>
  );
}
