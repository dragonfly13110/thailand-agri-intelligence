import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import { CROP_TABS, CROPS_SOURCE_NOTE, findCropTab } from '../../../../lib/hub/crops-soil-data';

export const dynamic = 'force-dynamic';

const ALLOWED_PARAMS = ['crop'] as const;

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
 * GET /api/v1/crops — ข้อมูลอ้างอิงพืชเศรษฐกิจ 6 แท็บ (ข้าว นาปี/นาปรัง, ข้าวโพดเลี้ยงสัตว์,
 * มันสำปะหลัง, อ้อยโรงงาน, ปาล์มน้ำมัน, ยางพารา) สำหรับหน้าแดชบอร์ด /crops
 * ประกอบด้วยปฏิทินการผลิต สายพันธุ์เด่น และช่วง pH/น้ำ/ปุ๋ยอ้างอิง พร้อม URL แหล่งอ้างอิง
 *
 * สถิติพื้นที่เพาะปลูก/ผลผลิตระดับประเทศถูกถอดออกระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ
 * จึงตอบเฉพาะโครงสร้างอ้างอิง (metadata-only) และไม่ประกาศ freshness/completeness
 *
 * พารามิเตอร์:
 * - crop = รหัสแท็บ (ดู `id` ใน CROP_TABS เช่น rice, corn) เพื่อกรองแท็บเดียว
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    validateQuery(url);
    const cropId = parseText(url, 'crop', 40);
    const tab = findCropTab(cropId);
    if (cropId && !tab) throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่พบพืชที่ระบุ: ' + cropId);
    const tabs = tab ? [tab] : CROP_TABS;
    return jsonData(tabs, {
      meta: {
        availability: 'metadata_only',
        freshness: 'unknown',
        completeness: 'unknown',
        access: 'metadata_only',
        sourceIds: ['oae', 'doae'],
        dataAsOf: null,
        sourceUpdatedAt: null,
        datasetVersion: 'crops-reference-v2',
        warnings: [
          'แสดงเฉพาะปฏิทินการเพาะปลูกและสายพันธุ์ สถิติพื้นที่/ผลผลิตระดับประเทศถูกระงับระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ',
          'ช่วง pH/น้ำ/ปุ๋ยเป็นค่าอ้างอิงจากเอกสารราชการรายพืช ไม่ใช่คำแนะนำรายแปลง — ควรยืนยันด้วยค่าวิเคราะห์ดินและข้อมูลพื้นที่จริง',
          CROPS_SOURCE_NOTE,
        ],
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
