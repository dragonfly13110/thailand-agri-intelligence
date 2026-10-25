import { handleApi, HubRequestError } from '../../../../lib/hub/http';

export const dynamic = 'force-dynamic';

export const WEATHER_ENGINE_WITHHELD_MESSAGE =
  'ยังไม่เปิดให้บริการ weather-engine: ทะเบียนสิทธิ์ของ Open-Meteo ERA5/forecast และ attribution ยังเป็น pending จึงไม่เรียกต้นทางและไม่เผยแพร่ตัวเลขใดจาก public route นี้';

/**
 * GET /api/v1/weather-engine
 *
 * Withheld while the Open-Meteo resources stay `pending` in
 * `config/resource_licenses.json`. The route must not:
 * - call Open-Meteo (or any upstream) during a public request,
 * - answer `approved_public`, `availability: ready` or `completeness: complete`,
 * - emit ET0 / heat-index / crop-water numbers.
 *
 * It answers the standard Hub error shape with HTTP 503 and
 * `cache-control: no-store`. A metadata-only demo is intentionally not served:
 * the numeric engine has no approved sample batch yet.
 */
export async function GET() {
  return handleApi(async () => {
    throw new HubRequestError(503, 'SOURCE_UNAVAILABLE', WEATHER_ENGINE_WITHHELD_MESSAGE);
  });
}
