import {
  createMeta,
  handleApi,
  HubRequestError,
  parseText,
} from '../../../../lib/hub/http';
import {
  CROP_TABS,
  CROPS_SOURCE_NOTE,
  DOAE_PRODUCTION_README_NOTE,
  findCropTab,
} from '../../../../lib/hub/crops-soil-data';
import { loadDoaeProductionBlock } from '../../../../lib/hub/doae-production-data';

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
 * สถิติพื้นที่เพาะปลูก/ผลผลิตระดับประเทศถูกถอดออกระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ
 * จึงตอบเฉพาะโครงสร้างอ้างอิง (metadata-only) และไม่ประกาศ freshness/completeness
 *
 * เพิ่มฟิลด์ `doaeProduction` ระดับ sibling ของ body (ไม่แก้ `data`/`meta` ของส่วนอ้างอิง)
 * ซึ่งบรรจุบล็อตภาวะการผลิตพืชอายุสั้นระดับตำบลที่อ่านจากแถวจริงที่เผยแพร่ในคลังกลางเท่านั้น
 * `sample:false` อยู่กับบล็อกนี้เท่านั้น สถานะว่าง/ไม่พร้อมต้องส่งออกมาอย่างซื่อตรง ห้ามแทนด้วยค่าตัวอย่าง
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

    // อ่านบล็อตจริง (bounded) — ถ้าคลังกลางไม่พร้อมจะคืนสถานะ unavailable ไม่ใช่ throw
    const doaeProduction = await loadDoaeProductionBlock({
      resourceKey: 'doae_production_subdistrict_2023',
    });

    const meta = createMeta({
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
        DOAE_PRODUCTION_README_NOTE,
        ...doaeProduction.warnings.map(warning => 'doaeProduction: ' + warning),
      ],
      runtimeMode: 'source_api_fallback',
    });

    return Response.json(
      { data: tabs, meta, doaeProduction },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  });
}
