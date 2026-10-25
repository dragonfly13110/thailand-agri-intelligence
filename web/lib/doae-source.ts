import 'server-only';

type DoaeMetadata = {
  title: string;
  description: string;
  organization: string;
  resourceCount: number;
  licenseTitle: string;
  modified: string;
  retrievedAt: string;
};

export async function getDoaeProductionMetadata(): Promise<DoaeMetadata | null> {
  try {
    const response = await fetch('https://ckan.doae.go.th/api/3/action/package_show?id=production_doae', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const length = Number(response.headers.get('content-length'));
    if (!response.ok || (Number.isFinite(length) && length > 262_144)) return null;
    const body = await response.text();
    if (body.length > 262_144) return null;
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== 'object') return null;
    const result = (payload as {success?: unknown; result?: unknown});
    if (result.success !== true || !result.result || typeof result.result !== 'object') return null;
    const item = result.result as Record<string, unknown>;
    if (item.name !== 'production_doae' || item.state !== 'active' || !Array.isArray(item.resources) || item.resources.length > 500) return null;
    const organization = item.organization && typeof item.organization === 'object'
      ? (item.organization as Record<string, unknown>).title
      : null;
    const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const title = text(item.title, 240);
    if (!title) return null;
    return {
      title,
      description: text(item.notes, 1_200),
      organization: text(organization, 160),
      resourceCount: item.resources.length,
      licenseTitle: text(item.license_title, 120),
      modified: text(item.metadata_modified, 40),
      retrievedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
