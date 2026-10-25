import { handleApi, HubRequestError, jsonData } from '../../../../lib/hub/http';
import {
  calculateFertilizer,
  FERTILIZER_CROPS,
  FERTILIZER_MODEL_VERSION,
} from '../../../../lib/hub/fertilizer-data';
import type { CropId, FertilizerInput, FertilizerPrices } from '../../../../lib/hub/fertilizer-data';

export const dynamic = 'force-dynamic';

type RawValue = string | number | null | undefined;

function cropOrThrow(raw: RawValue) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const crop = FERTILIZER_CROPS.find((item) => item.id === value);
  if (!crop) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      `ไม่รู้จักชนิดพืช "${value || '(ว่าง)'}"; ใช้ได้: ${FERTILIZER_CROPS.map((item) => item.id).join(', ')}`,
    );
  }
  return crop;
}

function numberOrThrow(
  raw: RawValue,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new HubRequestError(
      400,
      'INVALID_QUERY',
      `ค่า ${name} ต้องเป็นตัวเลขระหว่าง ${min} ถึง ${max}`,
    );
  }
  return value;
}

function optionalNumber(
  raw: RawValue,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  return numberOrThrow(raw, 0, name, min, max);
}

function buildInput(source: Record<string, RawValue>): FertilizerInput {
  const crop = cropOrThrow(source.crop);
  const prices: Partial<FertilizerPrices> = {};
  const urea = optionalNumber(source.priceUrea, 'priceUrea', 0, 1000);
  const dap = optionalNumber(source.priceDap, 'priceDap', 0, 1000);
  const mop = optionalNumber(source.priceMop, 'priceMop', 0, 1000);
  const baseline = optionalNumber(source.priceBaseline, 'priceBaseline', 0, 1000);
  if (urea !== undefined) prices.urea = urea;
  if (dap !== undefined) prices.dap = dap;
  if (mop !== undefined) prices.mop = mop;
  if (baseline !== undefined) prices.baseline = baseline;

  return {
    crop: crop.id as CropId,
    soilN: numberOrThrow(source.soilN, 15, 'soilN', 0, 200),
    soilP: numberOrThrow(source.soilP, 10, 'soilP', 0, 300),
    soilK: numberOrThrow(source.soilK, 60, 'soilK', 0, 500),
    omPercent: numberOrThrow(source.omPercent, 1.5, 'omPercent', 0, 10),
    ph: numberOrThrow(source.ph, 6.5, 'ph', 3, 10),
    targetYieldRai: numberOrThrow(source.targetYieldRai, crop.referenceYieldRai, 'targetYieldRai', 1, 100_000),
    ...(Object.keys(prices).length > 0 ? { prices } : {}),
  };
}

function respond(input: FertilizerInput) {
  const result = calculateFertilizer(input);
  return jsonData(result, {
    meta: {
      availability: 'ready',
      freshness: 'fresh',
      completeness: 'partial',
      access: 'metadata_only',
      sourceIds: ['doae', 'doa', 'ldd'],
      dataAsOf: '2026-10-25',
      sourceUpdatedAt: null,
      datasetVersion: FERTILIZER_MODEL_VERSION,
      warnings: result.warnings,
      runtimeMode: 'source_api_fallback',
    },
  });
}

/**
 * GET /api/v1/fertilizer
 * คำนวณสูตรแม่ปุ๋ย 3 ชนิด (46-0-0, 18-46-0, 0-0-60) จากค่าวิเคราะห์ดินและผลผลิตเป้าหมาย
 * พารามิเตอร์: crop (required), soilN, soilP, soilK, omPercent, ph, targetYieldRai,
 * priceUrea, priceDap, priceMop, priceBaseline
 * ผลลัพธ์เป็นแบบจำลอง metadata_only ไม่ใช่คำแนะนำรายแปลง
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const source: Record<string, RawValue> = {
      crop: url.searchParams.get('crop'),
      soilN: url.searchParams.get('soilN'),
      soilP: url.searchParams.get('soilP'),
      soilK: url.searchParams.get('soilK'),
      omPercent: url.searchParams.get('omPercent'),
      ph: url.searchParams.get('ph'),
      targetYieldRai: url.searchParams.get('targetYieldRai'),
      priceUrea: url.searchParams.get('priceUrea'),
      priceDap: url.searchParams.get('priceDap'),
      priceMop: url.searchParams.get('priceMop'),
      priceBaseline: url.searchParams.get('priceBaseline'),
    };
    return respond(buildInput(source));
  });
}

/**
 * POST /api/v1/fertilizer
 * รับ JSON body รูปแบบเดียวกับ GET; ใช้เมื่อต้องการส่งค่าหลายชุดโดยไม่ติดความยาว query
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HubRequestError(400, 'INVALID_QUERY', 'รูปแบบ JSON ของคำขอไม่ถูกต้อง');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HubRequestError(400, 'INVALID_QUERY', 'เนื้อหาคำขอต้องเป็น JSON object');
    }
    const record = body as Record<string, RawValue>;
    return respond(buildInput(record));
  });
}
