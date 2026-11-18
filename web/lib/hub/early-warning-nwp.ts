/**
 * Compact summary of the real TMD HPC NWP rainfall forecast for
 * `/early-warning`. The builder only reads published province values: a null
 * value is skipped (never 0), and no lead appears without a readable `validAt`.
 */

export type EarlyWarningNwpRunInput = {
  runId: string;
  initAt: string;
  retrievedAt: string;
  licenseStatus: string;
  unitStatus: string;
};

export type EarlyWarningNwpProvince = {
  provinceCode: string;
  provinceName: string;
  value: number | null;
  riskLevel: string | null;
};

export type EarlyWarningNwpPayload = {
  runId: string;
  variable: string;
  validAt: string;
  unit: string | null;
  provinces: EarlyWarningNwpProvince[];
};

export type EarlyWarningNwpLead = {
  leadHours: number;
  validAt: string;
  maxMm: number | null;
  provincesWithValue: number;
  top: EarlyWarningNwpProvince[];
};

export type EarlyWarningNwpForecast = {
  runId: string;
  initAt: string;
  retrievedAt: string;
  licenseStatus: string;
  unitStatus: string;
  variable: 'p24h';
  unit: string | null;
  leads: EarlyWarningNwpLead[];
};

const MAX_TOP_PROVINCES = 5;

function publishedValue(row: EarlyWarningNwpProvince): row is EarlyWarningNwpProvince & { value: number } {
  return typeof row.value === 'number' && Number.isFinite(row.value);
}

export function buildEarlyWarningNwpForecast(
  run: EarlyWarningNwpRunInput,
  payloads: EarlyWarningNwpPayload[],
): EarlyWarningNwpForecast | null {
  const initMs = Date.parse(run.initAt);
  if (!Number.isFinite(initMs)) return null;

  const seen = new Set<string>();
  const leads: EarlyWarningNwpLead[] = [];

  for (const payload of payloads) {
    const validMs = Date.parse(payload.validAt);
    if (!Number.isFinite(validMs) || seen.has(payload.validAt)) continue;
    const leadHours = Math.round((validMs - initMs) / 3_600_000);
    if (!Number.isFinite(leadHours) || leadHours < 0) continue;
    seen.add(payload.validAt);

    const published = payload.provinces.filter(publishedValue);
    const ranked = [...published].sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.provinceCode.localeCompare(b.provinceCode);
    });

    leads.push({
      leadHours,
      validAt: payload.validAt,
      maxMm: ranked.length > 0 ? ranked[0].value : null,
      provincesWithValue: published.length,
      top: ranked.slice(0, MAX_TOP_PROVINCES),
    });
  }

  if (leads.length === 0) return null;
  leads.sort((a, b) => a.leadHours - b.leadHours);

  return {
    runId: run.runId,
    initAt: run.initAt,
    retrievedAt: run.retrievedAt,
    licenseStatus: run.licenseStatus,
    unitStatus: run.unitStatus,
    variable: 'p24h',
    unit: payloads.find((payload) => payload.unit !== null)?.unit ?? null,
    leads,
  };
}
