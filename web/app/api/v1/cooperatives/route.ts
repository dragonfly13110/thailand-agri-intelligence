import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildCooperativesData,
  camelClassFromQuery,
  COOP_CLASS_LABELS,
  coopTypeFromQuery,
  COOP_DATASET_VERSION,
  COOP_PROVINCES,
  COOP_TYPE_LABELS,
  type CamelClass,
  type CoopType,
} from '../../../../lib/hub/cooperatives-data';

export const dynamic = 'force-dynamic';

const VALID_PROVINCE_CODES = new Set(COOP_PROVINCES.map((province) => province.code));

/** ป้ายภาค 6 ค่าที่ endpoint นี้รับ — สร้างจากทะเบียนจังหวัดของชุดข้อมูลนี้เอง จึงตรงกับค่าจริงในข้อมูลเสมอ */
const COOP_REGION_LABELS = Array.from(
  new Set(
    COOP_PROVINCES.map((province) => province.region.normalize('NFC').trim()).filter((label) => label.length > 0),
  ),
);

/** 'ภาค' เป็นคำนำหน้าที่ไม่มีความหมายในการกรอง จึงตัดออกก่อนเทียบ (NFC + ตัวพิมพ์เล็ก) */
function regionKey(label: string): string {
  const normalized = label.normalize('NFC').trim().toLowerCase();
  return normalized.startsWith('ภาค') ? normalized.slice('ภาค'.length).trim() : normalized;
}

/** key → ป้ายภาคตามที่เก็บในทะเบียนจังหวัด เพื่อให้ค่าที่ส่งต่อชั้นข้อมูลตรงกับข้อมูลจริงเสมอ */
const REGION_LABEL_BY_KEY = new Map<string, string>();
for (const label of COOP_REGION_LABELS) {
  const key = regionKey(label);
  if (key && !REGION_LABEL_BY_KEY.has(key)) REGION_LABEL_BY_KEY.set(key, label);
}

const COOP_TYPE_VALUES = Object.keys(COOP_TYPE_LABELS).join(', ');
const COOP_TYPE_THAI_VALUES = Object.values(COOP_TYPE_LABELS).join(' | ');
const COOP_CLASS_VALUES = Object.keys(COOP_CLASS_LABELS).join(', ');

/**
 * GET /api/v1/cooperatives
 *
 * สหกรณ์และกลุ่มเกษตรกรของไทยตามทะเบียนกรมส่งเสริมสหกรณ์ (แบบ deterministic sample)
 * คืนรายการสหกรณ์พร้อมสรุปจำนวน (summary.totalCooperatives) จำแนกตามประเภทสหกรณ์
 * และชั้นคุณภาพ (CAMEL class) กับหมายเหตุการครอบคลุม (coverageNote)
 * ไม่เรียกเครือข่ายภายนอก ไม่อ่านฐานข้อมูล และไม่แคชผลลัพธ์
 *
 * พารามิเตอร์ (ทุกค่าไม่บังคับ ไม่ระบุหรือ 'all' = ไม่กรอง; ส่งซ้ำรับค่าแรกตาม url.searchParams.get):
 * - provinceCode = รหัสจังหวัด 2 หลักในทะเบียนอ้างอิง 77 จังหวัด (เช่น 10, 20, 50, 80) หรือ 'all'
 * - region = ป้ายภาค 6 ค่าตามทะเบียนจังหวัดในชุดข้อมูลนี้
 *   (พิมพ์ 'เหนือ, กลาง, ใต้ ...' โดยไม่ต้องนำหน้า 'ภาค' ก็ได้) หรือ 'all'
 * - coopType = general_agri | settlement | fishery | dairy | community_enterprise
 *   หรือชื่อภาษาไทย สหกรณ์การเกษตรทั่วไป | สหกรณ์นิคม | สหกรณ์ประมง | สหกรณ์ผู้เลี้ยงโคนม |
 *   วิสาหกิจชุมชน/แปลงใหญ่ หรือ 'all'
 * - camelClass = tier1 | tier2 | tier3 หรือ 1 | 2 | 3 หรือ 'ชั้น 1'..'ชั้น 3' หรือ 'ดีเด่น' หรือ 'all'
 * - q = ข้อความค้นหาไม่เกิน 100 ตัวอักษร (ชื่อสหกรณ์ / จังหวัด / อำเภอ)
 * - search = คำพ้องความหมายของ q ใช้เมื่อไม่ส่ง q
 *
 * ไม่มีพารามิเตอร์ limit/pageSize เพราะชั้นข้อมูลสร้างทั้งชุดแบบ deterministic ในตัวและ
 * summary นับจาก payload ที่ยังไม่ตัดทอน การ slice ในชั้น route จึงทำให้ตัวเลขไม่ตรงกัน
 *
 * ข้อตกลงกำกับข้อมูล:
 * - data.sample = true เสมอ — ตัวเลขและจำนวนรายการทั้งหมดเป็นชุดตัวอย่างเชิงโครงสร้าง
 *   ที่ยังไม่ผ่านการตรวจสอบ สิทธิ์เผยแพร่ของ CPD/CAD ยัง pending ห้ามนำไปอ้างอิงเป็นสถิติทางการ
 * - meta.access/availability = "metadata_only" — เผยแพร่ได้เฉพาะตัวอย่างและ metadata
 * - meta.completeness/dataAsOf = unknown จนกว่าจะมีแถวข้อมูลที่ยืนยันจากแหล่งจริง
 * - meta.freshness = "unknown" — ชุดตัวอย่างถูกสร้างแบบ deterministic ไม่มีรอบ refresh
 *   สถานะ 'fresh'/'stale' จึงไม่มีความหมายสำหรับ endpoint นี้
 * - ตัวกรองที่ถูกต้องแต่ไม่มีรายการตรง = HTTP 200 พร้อม meta.availability = "empty" (ไม่ใช่ 404)
 *   404 กันไว้สำหรับ resource ที่ไม่มีอยู่จริงเท่านั้น ส่วนค่าพารามิเตอร์ที่ผิดเป็น 400 INVALID_QUERY
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawRegion = parseText(url, 'region', 40);
    const rawCoopType = parseText(url, 'coopType', 40);
    const rawCamelClass = parseText(url, 'camelClass', 30);
    const rawQuery = parseText(url, 'q', 100) || parseText(url, 'search', 100);

    let provinceCode: string | undefined;
    if (rawProvince && rawProvince !== 'all') {
      if (!VALID_PROVINCE_CODES.has(rawProvince)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `ไม่พบรหัสจังหวัดที่ระบุ: "${rawProvince}" — ต้องเป็นรหัส 2 หลักในทะเบียนจังหวัดอ้างอิง 77 จังหวัดของ Data Hub (เช่น 10, 20, 50, 80) หรือ all`,
        );
      }
      provinceCode = rawProvince;
    }

    let region: string | undefined;
    if (rawRegion && rawRegion !== 'all') {
      const resolved = REGION_LABEL_BY_KEY.get(regionKey(rawRegion));
      if (!resolved) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ region ค่า "${rawRegion}" ไม่รู้จัก — ใช้ได้เฉพาะ ${COOP_REGION_LABELS.join(', ')} หรือ all`,
        );
      }
      region = resolved;
    }

    let coopType: CoopType | undefined;
    if (rawCoopType && rawCoopType !== 'all') {
      const resolved = coopTypeFromQuery(rawCoopType) ?? coopTypeFromQuery(rawCoopType.toLowerCase());
      if (!resolved) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ coopType ค่า "${rawCoopType}" ไม่รู้จัก — ใช้ได้เฉพาะ ${COOP_TYPE_VALUES} (${COOP_TYPE_THAI_VALUES}) หรือ all`,
        );
      }
      coopType = resolved;
    }

    let camelClass: CamelClass | undefined;
    if (rawCamelClass && rawCamelClass !== 'all') {
      const resolved = camelClassFromQuery(rawCamelClass) ?? camelClassFromQuery(rawCamelClass.toLowerCase());
      if (!resolved) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          `พารามิเตอร์ camelClass ค่า "${rawCamelClass}" ไม่รู้จัก — ใช้ได้เฉพาะ ${COOP_CLASS_VALUES} (หรือ 1, 2, 3 / ชั้น 1-3) หรือ all`,
        );
      }
      camelClass = resolved;
    }

    const payload = buildCooperativesData({
      provinceCode,
      coopType,
      camelClass,
      region,
      q: rawQuery || undefined,
    });

    // ค่า filter ที่ถูกแต่ไม่มีรายการตรง = payload ว่าง พร้อม availability 'empty' ไม่ใช่ error
    const hasCooperatives = Array.isArray(payload.cooperatives) && payload.cooperatives.length > 0;
    return jsonData(payload, {
      meta: {
        availability: hasCooperatives ? 'metadata_only' : 'empty',
        // ชุดตัวอย่างเชิงโครงสร้างสร้างแบบ deterministic ไม่มีรอบ refresh จึงไม่มีความหมายของ 'fresh'/'stale'
        freshness: 'unknown',
        // แถวที่มีเป็น sample ไม่ใช่หลักฐานสำหรับประเมิน completeness ของทะเบียนจริง
        completeness: 'unknown',
        // สิทธิ์เผยแพร่ตัวเลขจริงของ CPD/CAD ยัง pending → เปิดเผยได้เฉพาะโครงสร้าง/metadata
        access: 'metadata_only',
        sourceIds: [],
        dataAsOf: null,
        datasetVersion: COOP_DATASET_VERSION,
        warnings: payload.warnings,
        // ApiMeta มีเฉพาะ 'database' | 'source_api_fallback' จึงใช้ 'database' ตาม lane พี่น้องที่ sample ในโค้ด
        runtimeMode: 'database',
      },
    });
  });
}
