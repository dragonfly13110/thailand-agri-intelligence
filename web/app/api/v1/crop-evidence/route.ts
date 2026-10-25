import { handleApi, HubRequestError, jsonData, parseText } from '../../../../lib/hub/http';
import {
  buildCropEvidence,
  CROP_EVIDENCE_DEFAULT_PROVINCE,
  CROP_EVIDENCE_PROVINCES,
  isCropEvidenceProvinceCode,
  normalizeCropEvidenceCrop,
  type ConfidenceLevel,
  type ReconciliationStatus,
} from '../../../../lib/hub/crop-evidence-data';

export const dynamic = 'force-dynamic';

const STATUS_VALUES: readonly ReconciliationStatus[] = ['verified', 'pending_verification', 'discrepancy'];
const CONFIDENCE_VALUES: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

function supportedProvincesText() {
  return CROP_EVIDENCE_PROVINCES.map((province) => province.code + ' ' + province.name).join(', ');
}

function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * GET /api/v1/crop-evidence
 *
 * กระทบยอดหลักฐานพื้นที่เพาะปลูกรายอำเภอและรายพืช เทียบพื้นที่ปลูกที่จังหวัดรายงาน
 * กับพื้นที่ขึ้นทะเบียนเกษตรกร (กรมส่งเสริมการเกษตร ทบก.01) และพื้นที่ที่ตรวจสอบภาคสนาม
 * คืนค่าร้อยละความคลาดเคลื่อน สถานะการกระทบยอด และระดับความเชื่อมั่น
 *
 * พารามิเตอร์:
 * - provinceCode = รหัสจังหวัด 2 หลัก เฉพาะจังหวัดที่รองรับ (ไม่รับ 'all' เพราะข้อมูลเป็นระดับอำเภอ
 *   ต้องระบุทีละจังหวัด) ถ้าไม่ระบุจะใช้จังหวัดเริ่มต้นและแจ้งใน meta.warnings
 * - crop = rice | cassava | corn หรือ 'all' (ไม่รวมพื้นที่ต่างพืชเข้าด้วยกัน)
 * - status = verified | pending_verification | discrepancy (กรองเฉพาะ districts)
 * - minConfidence = high | medium | low (กรองเฉพาะ districts ที่ระดับความเชื่อมั่นไม่ต่ำกว่าที่ระบุ)
 *
 * สรุปรายพืช (cropSummaries) และ statusCounts ไม่ถูกกรองด้วย status/minConfidence
 * ตัวกรองที่ใช้จริงอยู่ใน data.appliedFilters
 *
 * หมายเหตุ: ข้อมูลทั้งหมดเป็น deterministic sample (sample: true) และ
 * สิทธิ์เผยแพร่ตัวเลขจริงยังไม่ผ่านการยืนยัน (meta.access = metadata_only)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const rawProvince = parseText(url, 'provinceCode', 20);
    const rawCrop = parseText(url, 'crop', 40);
    const rawStatus = parseText(url, 'status', 40);
    const rawMinConfidence = parseText(url, 'minConfidence', 20);
    const extraWarnings: string[] = [];

    let provinceCode = CROP_EVIDENCE_DEFAULT_PROVINCE;
    if (!rawProvince) {
      extraWarnings.push('ไม่ได้ระบุ provinceCode จึงใช้จังหวัดเริ่มต้นรหัส ' + CROP_EVIDENCE_DEFAULT_PROVINCE);
    } else if (rawProvince.toLowerCase() === 'all') {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'ข้อมูลกระทบยอดเป็นระดับอำเภอ ต้องระบุจังหวัดทีละ 1 จังหวัด (รองรับ ' + supportedProvincesText() + ')'
      );
    } else if (!/^\d{2}$/.test(rawProvince) || !isCropEvidenceProvinceCode(rawProvince)) {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'ไม่รองรับรหัสจังหวัด: ' + rawProvince + ' (รองรับ ' + supportedProvincesText() + ')'
      );
    } else {
      provinceCode = rawProvince;
    }

    const crop = normalizeCropEvidenceCrop(rawCrop);
    if (!crop) {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'ไม่พบพืชที่ระบุ: ' + rawCrop + ' (รองรับ rice, cassava, corn)'
      );
    }

    let status: ReconciliationStatus | null = null;
    if (rawStatus) {
      if (!(STATUS_VALUES as readonly string[]).includes(rawStatus)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบสถานะที่ระบุ: ' + rawStatus + ' (รองรับ ' + STATUS_VALUES.join(', ') + ')'
        );
      }
      status = rawStatus as ReconciliationStatus;
    }

    let minConfidence: ConfidenceLevel | null = null;
    if (rawMinConfidence) {
      if (!(CONFIDENCE_VALUES as readonly string[]).includes(rawMinConfidence)) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'ไม่พบระดับความเชื่อมั่นที่ระบุ: ' + rawMinConfidence + ' (รองรับ ' + CONFIDENCE_VALUES.join(', ') + ')'
        );
      }
      minConfidence = rawMinConfidence as ConfidenceLevel;
    }

    const payload = buildCropEvidence({ provinceCode, crop });

    const districts = payload.districts.filter((district) => {
      if (status && district.status !== status) return false;
      if (minConfidence && CONFIDENCE_RANK[district.confidenceLevel] < CONFIDENCE_RANK[minConfidence]) return false;
      return true;
    });

    const averageScore = districts.length
      ? Math.round(districts.reduce((sum, district) => sum + district.confidenceScore, 0) / districts.length)
      : null;

    return jsonData(
      {
        ...payload,
        districts,
        appliedFilters: { provinceCode, crop, status, minConfidence },
        confidence: {
          averageScore,
          level: averageScore === null ? null : levelFromScore(averageScore),
          byStatus: payload.statusCounts,
        },
      },
      {
        meta: {
          availability: districts.length ? 'ready' : 'empty',
          freshness: 'unknown',
          completeness: 'partial',
          access: 'metadata_only',
          sourceIds: ['oae', 'doae', 'dopa'],
          dataAsOf: payload.dataAsOf,
          warnings: [...payload.warnings, ...extraWarnings],
          runtimeMode: 'database',
        },
      }
    );
  });
}
