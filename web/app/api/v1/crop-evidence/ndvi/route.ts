import { handleApi, jsonData } from '../../../../../lib/hub/http';
import type { Completeness } from '../../../../../lib/hub/types';
import { readCropEvidenceNdvi } from '../../../../../lib/hub/crop-evidence-ndvi';
import { MODIS_NDVI_SOURCE_ID, type CropEvidenceNdviEvidence } from '../../../../../lib/hub/crop-evidence-data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/crop-evidence/ndvi
 *
 * หลักฐาน NDVI จุดกริด (MODIS MOD13A1 v061, pixel 500 ม., composite 16 วัน) ที่เผยแพร่จริง
 * ในคลังกลาง — อ่านจาก published observations ของ resource `modis-13A1-061` เท่านั้น
 *
 * - ไม่มีพารามิเตอร์กรอง: ขอบเขต (จุด/tile/composite) กำหนดโดยจำนวนแถวที่อนุมัติเผยแพร่
 *   และแสดงครบใน data.scope เพื่อไม่ให้ผู้อ่านตีความเกินจริง
 * - สถานะพร้อมใช้ (ready) เฉพาะเมื่อมีแถวที่เผยแพร่ได้; ไม่มีแถว → 'empty', D1 อ่านไม่
 *   สำเร็จ → 'unavailable' — ทั้งสองกรณีไม่ส่งค่าตัวอย่างออกจากระบบเด็ดขาด
 * - ค่า composite ที่อ่านไม่ได้คง null และ NDVI คงเป็นดัชนีไร้หน่วย
 */
function completenessFor(evidence: CropEvidenceNdviEvidence): Completeness {
  if (evidence.availability !== 'ready') return 'unknown';
  if (evidence.capped) return 'partial';
  if (evidence.provenance.runStatuses.includes('partial')) return 'partial';
  return evidence.provenance.runStatuses.includes('succeeded') ? 'complete' : 'unknown';
}

export async function GET() {
  return handleApi(async () => {
    const evidence = await readCropEvidenceNdvi();
    return jsonData(evidence, {
      meta: {
        availability: evidence.availability,
        freshness: 'unknown',
        completeness: completenessFor(evidence),
        access: evidence.access,
        sourceIds: evidence.availability === 'ready' ? [MODIS_NDVI_SOURCE_ID] : [],
        dataAsOf: evidence.dataAsOf,
        sourceRetrievedAt: evidence.provenance.sourceRetrievedAt,
        datasetVersion: evidence.provenance.payloadSha256,
        warnings: evidence.warnings,
        runtimeMode: 'database',
      },
    });
  });
}
