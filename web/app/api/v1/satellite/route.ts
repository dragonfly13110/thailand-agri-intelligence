import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  GISTDA_LIVE_ENDPOINT,
  SATELLITE_GOVERNANCE,
  SATELLITE_WARNINGS,
  buildFloodObservation,
  getBasinFloodStats,
  getGistdaFloodFeed,
  getProvinceSatelliteRisks,
  getSatelliteScenes,
  getSatelliteSources,
  getSatelliteSummary,
  normalizeGistdaFloodFeatureCollection,
  snapshotFloodPolygons,
  type FloodObservationPayload,
  type GistdaFloodPolygonLite,
  type SatelliteLayer,
  type SatellitePlatform,
  type SatelliteScene,
} from '../../../../lib/hub/satellite-data';

export const dynamic = 'force-dynamic';

const LAYERS: SatelliteLayer[] = ['flood', 'drought', 'ndvi'];
const PLATFORMS: SatellitePlatform[] = ['gistda', 'sentinel', 'modis'];

/** เพดานเวลาของ live call หนึ่งครั้ง — เกินนี้ถือว่าล้มเหลวแล้ว fallback snapshot (fail-closed) */
const GISTDA_LIVE_TIMEOUT_MS = 8_000;

type LiveFloodResult =
  | { ok: true; polygons: GistdaFloodPolygonLite[]; timeStamp: string | null; retrievedAt: string }
  | { ok: false; code: string };

/**
 * ยิง GISTDA flood/7days แบบ live (bounded request เดียว, timeout, ไม่มี retry)
 * API key มาจาก `process.env.GISTDA_API_KEY` เท่านั้น — ไม่เก็บ log ไม่ส่งต่อ
 * และเนื่องจาก gateway echo key กลับมาใน `links[].href` ของ raw payload จึง
 * เก็บเฉพาะ polygon ที่ normalize แล้ว ไม่เก็บ raw payload ใด ๆ ทั้งสิ้น
 * ข้อผิดพลาดทุกชนิดตอบเป็นรหัสคงที่ (ไม่มี URL/credential ปน)
 */
async function fetchLiveFlood(): Promise<LiveFloodResult> {
  const key = (process.env.GISTDA_API_KEY ?? '').trim();
  if (!key) return { ok: false, code: 'GISTDA_API_KEY_MISSING' };
  let response: Response;
  try {
    response = await fetch(`${GISTDA_LIVE_ENDPOINT}?api_key=${encodeURIComponent(key)}`, {
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent': 'TADIH-ThailandAgriculturalDataHub/1.0',
      },
      signal: AbortSignal.timeout(GISTDA_LIVE_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'GISTDA_UNAVAILABLE' };
  }
  if (!response.ok) return { ok: false, code: `GISTDA_HTTP_${response.status}` };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, code: 'GISTDA_INVALID_RESPONSE' };
  }
  const normalized = normalizeGistdaFloodFeatureCollection(payload);
  if (!normalized) return { ok: false, code: 'GISTDA_INVALID_RESPONSE' };
  return { ok: true, ...normalized, retrievedAt: new Date().toISOString() };
}

/**
 * GET /api/v1/satellite
 *
 * ดาวเทียมเกษตร (น้ำท่วม/ภัยแล้ง/NDVI) สำหรับหน้า /satellite
 *
 * ชั้นน้ำท่วม (โหมด ก — live-first, fail-closed):
 * - ทุกคำขอพยายามเรียก `api-gateway.gistda.or.th/api/2.0/resources/features/
 *   flood/7days` สดด้วย `GISTDA_API_KEY` (server-side, timeout 8 วินาที)
 *   สำเร็จ → `floodObservation.sourceMode = "live"` พร้อมเวลา retrieval,
 *   จำนวน polygon, พื้นที่น้ำท่วมรายจังหวัด DOPA แยกหน่วย ไร่/ตร.กม.
 *   (ห้ามบวกข้ามหน่วย; 1 ตร.กม. = 625 ไร่), tambon_count, ชนิดดาวเทียม และ
 *   `sample:false` เฉพาะชั้นนี้
 * - ล้มเหลว → fallback snapshot จริงที่ bundle ไว้
 *   (`web/data/gistda_flood_7days.json`) โดยประกาศชัดผ่าน
 *   `sourceMode = "snapshot"` + `snapshotRetrievedAt` + `liveFailureCode`
 * - ถ้าทั้ง live และ snapshot ไม่มี polygon ที่ใช้ได้ → 503
 *   `SATELLITE_FEED_UNAVAILABLE` (fail-closed — ไม่แต่งค่า)
 *
 * ชั้นภัยแล้ง (VCI/TCI/SPI) และ NDVI/EVI/NDMI ใน `provinces`:
 * - เป็นการจำลองแบบ deterministic (seeded) เท่านั้น — `layerTruth` ระบุ
 *   `sample: true` ต่อชั้น ทุกแถวติด `dataKind: "modelled"` และมี banner
 *   รายชั้นใน `layerBanners` ห้ามตีความเป็นค่าตรวจวัด
 * - ตัวเลขจำลองไม่ถูกนำเสนอเป็นข้อมูลจริงอีกต่อไป: ค่าจริงของชั้นน้ำท่วม
 *   อยู่ที่ `floodObservation` เท่านั้น
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
 * Governance: `meta.access = 'approved_public'` เฉพาะชั้น flood ที่มี registry
 * `gistda_flood_7days_daily` (approved_public + project_publication_approved)
 * ส่วนชั้นที่เหลือยัง modelled → `meta.completeness = 'partial'` และ
 * `data.layerTruth` ระบุชั้นที่ยังไม่เป็นข้อมูลตรวจวัด
 * `dataAsOf`/`sourceUpdatedAt` = เวลาของชั้นน้ำท่วมจริงตามโหมด (live = upstream
 * timeStamp ของคำขอนี้, snapshot = เวลา retrieval ของไฟล์) และ payload
 * ไม่ถูกแคช (`cache-control: no-store` จาก jsonData)
 *
 * โหมดทดสอบ: ตั้ง `GISTDA_LIVE_SIMULATE_FAILURE=1` เพื่อบังคับให้ route
 * ปฏิบัติราวกับ live call ล้มเหลว (ใช้ตรวจ snapshot path) — ไม่กระทบค่าจริง
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

    // --- ชั้นน้ำท่วม: live-first, fail-closed ไป snapshot ที่ระบุชัด ---
    const simulateFailure = (process.env.GISTDA_LIVE_SIMULATE_FAILURE ?? '').trim() === '1';
    const live = simulateFailure ? ({ ok: false, code: 'GISTDA_SIMULATED_FAILURE' } as const) : await fetchLiveFlood();
    const snapshot = snapshotFloodPolygons();

    let floodObservation: FloodObservationPayload;
    let floodMode: 'live' | 'snapshot';
    if (live.ok) {
      floodMode = 'live';
      floodObservation = buildFloodObservation(live.polygons, {
        sourceMode: 'live',
        retrievedAt: live.retrievedAt,
        snapshotRetrievedAt: snapshot.snapshotRetrievedAt,
        liveFailureCode: null,
      });
    } else if (snapshot.polygons.length > 0) {
      floodMode = 'snapshot';
      floodObservation = buildFloodObservation(snapshot.polygons, {
        sourceMode: 'snapshot',
        retrievedAt: snapshot.snapshotRetrievedAt,
        snapshotRetrievedAt: snapshot.snapshotRetrievedAt,
        liveFailureCode: live.code,
      });
    } else {
      throw new HubRequestError(
        503,
        'SATELLITE_FEED_UNAVAILABLE',
        'ไม่สามารถดึงชั้นน้ำท่วมได้ทั้งแบบสด (code=' + live.code + ') และจาก snapshot — ไม่แสดงค่าที่ไม่ใช่ข้อมูลจริง',
      );
    }

    const summary = getSatelliteSummary();
    const provinces = getProvinceSatelliteRisks({ provinceCode, region, layer, query });
    const basins = getBasinFloodStats({ region });
    const scenes = getSatelliteScenes({ provinceCode, platform });
    const sources = getSatelliteSources();

    const warnings = [...SATELLITE_WARNINGS];
    if (floodMode === 'snapshot') {
      warnings.push(
        'โหมดชั้นน้ำท่วม: SNAPSHOT — live call ล้มเหลว (code=' + floodObservation.liveFailureCode + ') '
        + 'ค่าที่แสดงคือ snapshot จริงจาก GISTDA ณ ' + snapshot.snapshotRetrievedAt + ' ไม่ใช่ข้อมูลสดของวินาทีนี้',
      );
    } else if (floodObservation.provinceCount === 0) {
      warnings.push(
        'GISTDA ตอบสำเร็จแต่ไม่พบ polygon น้ำท่วมในหน้าต่าง 7 วันนี้ — เป็นค่าจริง (ว่างเพราะไม่มีการตรวจพบ) ไม่ใช่ความล้มเหลวของระบบ',
      );
    }
    warnings.push(
      'ค่าใน layerTruth.drought/ndvi และฟิลด์ drought/ndvi ของ provinces เป็นการจำลอง deterministic (sample:true) '
      + 'ตัวเลขจริงของชั้นน้ำท่วมอยู่ใน floodObservation เท่านั้น',
    );
    if (provinceCode && provinces.length === 0) {
      warnings.push(
        'ไม่พบจังหวัดรหัส ' + provinceCode + ' ในชุดข้อมูลสาธิตนี้ (demo subset) '
        + 'ผลลัพธ์จึงว่าง — ไม่ได้แปลว่าไม่มีข้อมูลดาวเทียมของจังหวัดนั้น และไม่ใช่ว่าข้อมูลครอบคลุม 77 จังหวัด',
      );
    }

    const floodAsOf = floodObservation.sourceMode === 'live'
      ? (live.ok ? live.timeStamp ?? live.retrievedAt : floodObservation.retrievedAt)
      : snapshot.snapshotRetrievedAt;

    return jsonData(
      {
        // `sample:false` อ้างถึงชั้นน้ำท่วม (floodObservation) เท่านั้น —
        // ชั้นจำลองระบุรายชั้นใน layerTruth/bannerText ห้ามอ่านเป็น "ทั้ง payload จริง"
        sample: SATELLITE_GOVERNANCE.sample,
        sampleScope: SATELLITE_GOVERNANCE.sampleScope,
        bannerText: SATELLITE_GOVERNANCE.bannerText,
        disclaimer: SATELLITE_GOVERNANCE.disclaimer,
        layerBanners: SATELLITE_GOVERNANCE.layerBanners,
        layerTruth: {
          flood: {
            sample: false,
            source: 'gistda_flood_7days',
            dataKind: 'observed',
            sourceMode: floodObservation.sourceMode,
            retrievedAt: floodObservation.retrievedAt,
          },
          drought: {
            sample: true,
            source: null,
            dataKind: 'modelled',
            note: 'แบบจำลอง deterministic — ไม่ใช่ข้อมูลตรวจวัด ห้ามใช้อ้างอิง',
          },
          ndvi: {
            sample: true,
            source: null,
            dataKind: 'modelled',
            note: 'แบบจำลอง deterministic — ไม่ใช่ข้อมูลตรวจวัด ห้ามใช้อ้างอิง',
          },
        },
        /** ค่าจริงของชั้นน้ำท่วมในคำขอนี้ (live/snapshot พร้อมเวลาและรหัสล้มเหลว) */
        floodObservation,
        /** ค่า snapshot ที่ bundle ในโมดูล — provinces/basins/summary ใช้ชุดนี้ */
        feed: getGistdaFloodFeed(),
        summary,
        provincesNote:
          'provinces/basins/scenes/summary ด้านล่างสร้างจาก snapshot ที่ bundle ไว้ (floodSourceMode=snapshot) '
          + 'บวกชั้น modelled (drought/ndvi) — ค่าสดจริงของคำขอนี้อยู่ใน floodObservation',
        provinces,
        basins,
        scenes,
        sources,
        acquisition: buildAcquisitionMetadata(scenes),
      },
      {
        meta: {
          availability: 'ready',
          freshness: floodObservation.sourceMode === 'live' ? 'fresh' : 'stale',
          completeness: 'partial',
          access: SATELLITE_GOVERNANCE.access,
          sourceIds: ['gistda', 'sentinel', 'modis'],
          dataAsOf: floodAsOf,
          sourceUpdatedAt: floodAsOf,
          sourceRetrievedAt: floodObservation.retrievedAt,
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
    resolutionsM: distinct(
      scenes.map((scene) => scene.resolutionM).filter((value): value is number => value !== null),
    ).sort((a, b) => a - b),
    dataKinds: distinct(scenes.map((scene) => scene.dataKind)),
    note:
      'สรุปจาก scenes ในผลลัพธ์ที่ผ่านการกรองของคำขอนี้ (derived metadata) '
      + 'scene ที่ dataKind="observed" มาจาก imaging stamp จริงของ GISTDA '
      + 'ส่วน scene ที่ dataKind="modelled" เป็นการจำลองเพื่อสาธิตหน้าจอ',
  };
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}
