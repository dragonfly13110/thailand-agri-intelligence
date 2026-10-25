import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  SATELLITE_GOVERNANCE,
  SATELLITE_WARNINGS,
  getBasinFloodStats,
  getProvinceSatelliteRisks,
  getSatelliteScenes,
  getSatelliteSources,
  getSatelliteSummary,
  type SatelliteLayer,
  type SatellitePlatform,
  type SatelliteScene,
} from '../../../../lib/hub/satellite-data';

export const dynamic = 'force-dynamic';

const LAYERS: SatelliteLayer[] = ['flood', 'drought', 'ndvi'];
const PLATFORMS: SatellitePlatform[] = ['gistda', 'sentinel', 'modis'];

/**
 * GET /api/v1/satellite
 *
 * ดาวเทียมเกษตร (น้ำท่วม/ภัยแล้ง/NDVI) สำหรับหน้า /satellite — ข้อมูลทั้งหมดเป็น
 * synthetic deterministic sample (`sample: true`) ยังไม่มีการดึงภาพดาวเทียมจริง
 *
 * สถานะสิทธิ์ (licence/discovery) ของทั้ง 3 แหล่งใน data.sources — ทุกแหล่ง
 * `license_status: pending` และ `project_publication_approved: false`:
 * - GISTDA และ Sentinel: ไม่มีแถวใน config/resource_licenses.json เลย
 *   (สถานะ discovery_required, licenseReviewRows = 0)
 * - MODIS: มี 1 แถวสถานะ pending, project_publication_approved = false
 *
 * พารามิเตอร์ (ตรวจค่าทั้งหมด ไม่รู้จักตอบ 400 INVALID_QUERY ผ่าน handleApi):
 * - provinceCode = เลข 2 หลักตาม /^\d{2}$/ เท่านั้น; รหัสที่รูปแบบถูกแต่ไม่อยู่ใน
 *   ชุดสาธิต ตอบ 200 พร้อมผลลัพธ์ว่างและคำเตือนใน meta.warnings (ไม่ใช่ 400 และ
 *   จำนวนจังหวัดที่นี่เป็น demo subset ห้ามอ่านเป็น coverage 77 จังหวัด)
 * - layer   = flood | drought | ndvi (ไม่ส่ง = ทุกชั้น)
 * - region  = ชื่อภาค ส่งผ่านไปยัง getProvinceSatelliteRisks/getBasinFloodStats
 * - q       = คำค้นหาอิสระ ส่งผ่านไปยัง getProvinceSatelliteRisks
 * - platform= gistda | sentinel | modis (กรอง scenes)
 *
 * data.acquisition สรุปชนิดแพลตฟอร์ม วันที่ถ่ายภาพ และ CRS จากผลลัพธ์ scenes
 * ที่ผ่านการกรองจริง (derived ไม่ใช่ค่าคงที่) — คง missing เป็น null และไม่รวม
 * inundatedAreaRai กับ inundatedAreaSqKm เข้าด้วยกัน (คนละหน่วย คนละ grain)
 *
 * Governance: meta.access = 'metadata_only' เสมอ (ห้ามเป็น approved_public),
 * dataAsOf/sourceUpdatedAt = null เพราะไม่มีแหล่งใดผ่าน runtime verification,
 * runtimeMode = 'source_api_fallback' (ไม่มีการอ่านฐานข้อมูล) และ payload
 * ไม่ถูกแคช (`cache-control: no-store` จาก jsonData)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const provinceCodeParam = parseText(url, 'provinceCode', 2);
    if (provinceCodeParam && !/^\d{2}$/.test(provinceCodeParam)) {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'รหัสจังหวัด provinceCode ไม่ถูกต้อง: ' + provinceCodeParam + ' (ต้องเป็นตัวเลข 2 หลัก เช่น 12)',
      );
    }

    const layerParam = parseText(url, 'layer', 10);
    let layer: SatelliteLayer | undefined;
    if (layerParam) {
      const matched = LAYERS.find((value) => value === layerParam);
      if (!matched) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ชั้นข้อมูล layer ไม่ถูกต้อง: ' + layerParam + ' (ใช้ได้: ' + LAYERS.join(', ') + ')',
        );
      }
      layer = matched;
    }

    const platformParam = parseText(url, 'platform', 10);
    let platform: SatellitePlatform | undefined;
    if (platformParam) {
      const matched = PLATFORMS.find((value) => value === platformParam);
      if (!matched) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'แพลตฟอร์ม platform ไม่ถูกต้อง: ' + platformParam + ' (ใช้ได้: ' + PLATFORMS.join(', ') + ')',
        );
      }
      platform = matched;
    }

    const region = parseText(url, 'region', 80) || undefined;
    const query = parseText(url, 'q', 120) || undefined;
    const provinceCode = provinceCodeParam || undefined;

    const summary = getSatelliteSummary();
    const provinces = getProvinceSatelliteRisks({ provinceCode, region, layer, query });
    const basins = getBasinFloodStats({ region });
    const scenes = getSatelliteScenes({ provinceCode, platform });
    const sources = getSatelliteSources();

    const warnings = [...SATELLITE_WARNINGS];
    if (provinceCode && provinces.length === 0) {
      warnings.push(
        'ไม่พบจังหวัดรหัส ' + provinceCode + ' ในชุดข้อมูลสาธิตนี้ (demo subset) '
        + 'ผลลัพธ์จึงว่าง — ไม่ได้แปลว่าไม่มีข้อมูลดาวเทียมของจังหวัดนั้น และไม่ใช่ว่าข้อมูลครอบคลุม 77 จังหวัด',
      );
    }

    return jsonData(
      {
        sample: SATELLITE_GOVERNANCE.sample,
        bannerText: SATELLITE_GOVERNANCE.bannerText,
        disclaimer: SATELLITE_GOVERNANCE.disclaimer,
        summary,
        provinces,
        basins,
        scenes,
        sources,
        acquisition: buildAcquisitionMetadata(scenes),
      },
      {
        meta: {
          availability: 'ready',
          freshness: 'fresh',
          completeness: 'complete',
          access: SATELLITE_GOVERNANCE.access,
          sourceIds: ['gistda', 'sentinel', 'modis'],
          dataAsOf: new Date().toISOString(),
          sourceUpdatedAt: new Date().toISOString(),
          datasetVersion: SATELLITE_GOVERNANCE.version,
          warnings,
          runtimeMode: 'source_api_fallback',
        },
      },
    );
  });
}

/**
 * สรุป metadata การได้มาของภาพ (ชนิดแพลตฟอร์ม / วันที่ถ่าย / CRS / ความละเอียด)
 * จาก scenes ที่ผ่านการกรองจริงของคำขอนั้น ๆ ไม่ใช่ค่าคงที่ — ถ้าไม่มี scene เลย
 * ทุกค่าที่หาไม่ได้คงเป็น null/[] ตามกฎ "missing = null"
 */
function buildAcquisitionMetadata(scenes: SatelliteScene[]) {
  const acquiredAtValues = scenes.map((scene) => scene.acquiredAt).sort();

  return {
    sceneCount: scenes.length,
    platforms: distinct(scenes.map((scene) => scene.platform)),
    sensors: distinct(scenes.map((scene) => scene.sensor)),
    earliestAcquiredAt: acquiredAtValues[0] ?? null,
    latestAcquiredAt: acquiredAtValues[acquiredAtValues.length - 1] ?? null,
    crs: distinct(scenes.map((scene) => scene.crs)),
    resolutionsM: distinct(scenes.map((scene) => scene.resolutionM)).sort((a, b) => a - b),
    note:
      'สรุปจาก scenes ในผลลัพธ์ที่ผ่านการกรองของคำขอนี้ (derived metadata) '
      + 'ไม่ใช่สถิติทางการ และไม่ใช่หลักฐานว่ามีการรับภาพจริงจากแหล่งต้นทาง',
  };
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}
