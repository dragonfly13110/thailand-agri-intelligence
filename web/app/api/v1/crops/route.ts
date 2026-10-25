import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import { CROP_TABS, CROPS_SOURCE_NOTE, findCropTab } from '../../../../lib/hub/crops-soil-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/crops — ข้อมูลอ้างอิงพืชเศรษฐกิจ 6 แท็บ (ข้าว นาปี/นาปรัง, ข้าวโพดเลี้ยงสัตว์,
 * มันสำปะหลัง, อ้อยโรงงาน, ปาล์มน้ำมัน, ยางพารา) สำหรับหน้าแดชบอร์ด /crops
 * ประกอบด้วยปฏิทินการผลิตและสายพันธุ์เด่น พร้อม URL แหล่งอ้างอิง
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
          CROPS_SOURCE_NOTE,
        ],
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
