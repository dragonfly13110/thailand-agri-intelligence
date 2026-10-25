import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import { buildLivestockDashboard } from '../../../../lib/hub/livestock-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/livestock
 *
 * ข้อมูลอ้างอิงปศุสัตว์ (กรมปศุสัตว์) และสัตว์น้ำเศรษฐกิจ (กรมประมง) สำหรับหน้า /livestock
 *
 * พารามิเตอร์:
 * - sector = livestock | aquaculture เลือกเซกเตอร์เดียว
 * - species = รหัสชนิดสัตว์ เช่น cattle, whiteleg-shrimp, tilapia
 *   ค่าที่ไม่รู้จักจะตอบ 400 INVALID_QUERY (ห้ามเดาชนิดสัตว์)
 *
 * สิทธิ์: ทรัพยากรทั้งหมดยังอยู่ระหว่างตรวจสิทธิ์ใน config/resource_licenses.json
 * จึงไม่ส่งตัวเลขจริงจากต้นทาง — ค่าที่ส่งเป็นค่าตัวอย่างแบบ deterministic
 * พร้อม sample flag, access: 'metadata_only' และ warnings ชุดเดียวกับ payload
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const sectorParam = parseText(url, 'sector', 40);
    const speciesParam = parseText(url, 'species', 40);
    const payload = buildLivestockDashboard();

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

    return jsonData(
      { ...payload, sectors, sources },
      {
        meta: {
          availability: 'ready',
          freshness: 'fresh',
          completeness: 'complete',
          access: 'metadata_only',
          sourceIds: ['dld', 'dof'],
          dataAsOf: null,
          sourceUpdatedAt: null,
          datasetVersion: 'livestock-aquaculture-reference-v1',
          warnings: payload.warnings,
          runtimeMode: 'source_api_fallback',
        },
      },
    );
  });
}
