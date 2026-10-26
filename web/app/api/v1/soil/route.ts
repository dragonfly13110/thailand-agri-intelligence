import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  FERTILIZER_GUIDANCE,
  findFertilizerGuidance,
  findSoilSeries,
  searchSoilSeries,
  SOIL_NOT_FOUND_NAMES,
  SOIL_PROBLEMS,
  SOIL_SEARCH_HINT,
  SOIL_SERIES,
  SOIL_SOURCE_NOTE,
} from '../../../../lib/hub/crops-soil-data';

export const dynamic = 'force-dynamic';

const ALLOWED_PARAMS = ['q', 'series', 'crop'] as const;

/** ปฏิเสธพารามิเตอร์ที่ไม่รู้จัก ซ้ำ หรือระบุแต่ค่าว่าง — คงมาตรฐาน 400 INVALID_QUERY */
function validateQuery(url: URL) {
  const allowed = new Set<string>(ALLOWED_PARAMS);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่รู้จักพารามิเตอร์: ' + key);
    }
  }
  for (const name of ALLOWED_PARAMS) {
    if (url.searchParams.getAll(name).length > 1) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ระบุพารามิเตอร์ซ้ำ: ' + name);
    }
    if (url.searchParams.has(name) && !url.searchParams.get(name)?.trim()) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ต้องไม่ว่าง');
    }
  }
}

/**
 * GET /api/v1/soil — ค้นกลุ่มชุดดิน LDD และคำแนะนำปุ๋ย สำหรับหน้าแดชบอร์ด /soil
 *
 * พารามิเตอร์:
 * - q = คำค้น (ชื่อชุดดิน, รหัสเช่น Ks, หมายเลขกลุ่ม, ภาค, ชื่ออำเภอ/จังหวัดที่ชุดดินตั้งชื่อตาม)
 * - series = id ชุดดิน (เช่น kamphaeng-saen) เพื่อดึงรายละเอียดชุดเดียว
 * - crop = รหัสพืช (rice | corn | cassava | sugarcane | oil-palm | rubber) เพื่อดึงคำแนะนำปุ๋ยชุดเดียว
 *
 * ไม่ระบุพารามิเตอร์ = คืนทุกชุดดิน + ทุกคำแนะนำปุ๋ย + คู่มือปัญหาดิน
 * ตัวเลขเป็นเอกสารเผยแพร่ของหน่วยงานราชการ (LDD/กรมวิชาการเกษตร/กรมส่งเสริมการเกษตร)
 * ไม่ใช่ observation ในคลังกลาง จึงคง `access: 'metadata_only'`
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    validateQuery(url);
    const q = parseText(url, 'q', 80);
    const seriesId = parseText(url, 'series', 60);
    const cropId = parseText(url, 'crop', 40);

    const series = seriesId ? findSoilSeries(seriesId) : null;
    if (seriesId && !series) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบชุดดินที่ระบุ: ' + seriesId);
    }
    const guidance = cropId ? findFertilizerGuidance(cropId) : null;
    if (cropId && !guidance) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบพืชที่ระบุ: ' + cropId);
    }

    const payload = {
      series: series ? [series] : searchSoilSeries(q),
      guidance: guidance ? [guidance] : FERTILIZER_GUIDANCE,
      problems: SOIL_PROBLEMS,
      searchHint: SOIL_SEARCH_HINT,
      unregisteredNames: SOIL_NOT_FOUND_NAMES,
      totalSeries: SOIL_SERIES.length,
    };

    return jsonData(payload, {
      meta: {
        availability: 'ready',
        freshness: 'fresh',
        completeness: 'complete',
        access: 'metadata_only',
        sourceIds: ['ldd', 'doae'],
        dataAsOf: '2026-10-25',
        sourceUpdatedAt: null,
        datasetVersion: 'soil-fertilizer-reference-v1',
        warnings: [
          'ชุดดินเป็นหน่วยดินตามการสำรวจของ LDD หนึ่งจังหวัดมีหลายชุดดิน — ชื่อพื้นที่ใช้แมตช์การค้นหา ไม่ใช่ขอบเขตทั้งจังหวัด',
          `เผยแพร่เฉพาะ ${SOIL_SERIES.length} ชุดดินที่ยืนยันจาก LDD; ชื่อที่ยังไม่ยืนยัน (${SOIL_NOT_FOUND_NAMES.join(', ')}) อยู่ใน unregisteredNames และไม่ถูกแปลงเป็นแถวข้อมูล`,
          'ตัวเลขปุ๋ยเป็นค่าจากเอกสารต้นทางรายพืช ไม่ใช่คำแนะนำรายแปลง — ควรยืนยันด้วยค่าวิเคราะห์ดินจริง',
          SOIL_SOURCE_NOTE,
        ],
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
