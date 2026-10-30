import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import { buildLivestockDashboard } from '../../../../lib/hub/livestock-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/livestock (legacy)
 *
 * Mixed reference endpoint: DLD livestock sections carry real numbers read from
 * the central store (only when an approved run publishes them — otherwise the
 * section is explicitly empty/unavailable, never sample), while the DOF
 * aquaculture sections are still deterministic samples pending licence review.
 *
 * พารามิเตอร์:
 * - sector = livestock | aquaculture เลือกเซกเตอร์เดียว
 * - species = รหัสชนิดสัตว์ เช่น cattle, whiteleg-shrimp, tilapia
 *   ค่าที่ไม่รู้จักจะตอบ 400 INVALID_QUERY (ห้ามเดาชนิดสัตว์)
 *
 * meta.access คงเป็น metadata_only เพราะ payload ยังรวมค่าตัวอย่างของฝั่งกรมประมง
 * สถานะข้อมูลจริงรายชนิดดูได้จาก summary.readState และ summary.provenance
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const sectorParam = parseText(url, 'sector', 40);
    const speciesParam = parseText(url, 'species', 40);
    const payload = await buildLivestockDashboard();

    const knownSpecies = payload.sectors.flatMap((sector) => sector.species.map((entry) => entry.def));
    if (sectorParam && !payload.sectors.some((sector) => sector.id === sectorParam)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบเซกเตอร์ที่ระบุ: ' + sectorParam);
    }
    if (speciesParam && !knownSpecies.some((def) => def.id === speciesParam)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบชนิดสัตว์ที่ระบุ: ' + speciesParam);
    }

    const sectors = payload.sectors
      .filter((sector) => !sectorParam || sector.id === sectorParam)
      .map((sector) => ({
        ...sector,
        species: sector.species.filter((entry) => !speciesParam || entry.def.id === speciesParam),
      }))
      .filter((sector) => sector.species.length > 0);

    // ถ้าระบุทั้งเซกเตอร์และชนิดสัตว์ที่ไม่ได้อยู่ในเซกเตอร์นั้น ต้องตอบผิดพลาด ไม่เงียบกลืน
    if (speciesParam && sectors.length === 0) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ชนิดสัตว์ที่ระบุไม่อยู่ในเซกเตอร์ที่เลือก: ' + speciesParam);
    }

    const agencyIds = new Set(sectors.map((sector) => sector.agencyLabel));
    const sources = payload.sources.filter((source) => agencyIds.has(source.agencyLabel));

    const summaries = sectors.flatMap((sector) => sector.species.map((entry) => entry.summary));
    const anyReal = summaries.some((summary) => summary.readState === 'real');
    const anyUnloaded = summaries.some((summary) => summary.readState === 'empty' || summary.readState === 'unavailable');
    const anyUnavailable = summaries.some((summary) => summary.readState === 'unavailable');

    return jsonData(
      { ...payload, sectors, sources },
      {
        meta: {
          availability: anyReal ? 'ready' : anyUnavailable ? 'unavailable' : 'empty',
          freshness: anyReal ? 'fresh' : 'unknown',
          completeness: anyReal ? 'partial' : anyUnloaded ? 'unknown' : 'complete',
          access: 'metadata_only',
          sourceIds: ['dld', 'dof'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: 'livestock-aquaculture-reference-v2',
          warnings: payload.warnings,
          runtimeMode: 'database',
        },
      },
    );
  });
}
