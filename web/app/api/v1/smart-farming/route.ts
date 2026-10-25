import { handleApi, HubRequestError, jsonData, parsePositiveInt, parseText } from '../../../../lib/hub/http';
import {
  buildSmartFarmingDashboard,
  SMART_FARMING_GOVERNANCE,
  getSmartFarmingFarms,
} from '../../../../lib/hub/smart-farming-data';
import type { FarmPlot, MoistureStatus, SmartFarmingDashboardPayload } from '../../../../lib/hub/smart-farming-data';

export const dynamic = 'force-dynamic';

const MOISTURE_STATUSES: MoistureStatus[] = ['saturated', 'adequate', 'watch', 'deficit', 'critical'];
const SENSOR_STATES = ['all', 'online', 'offline', 'low_battery'] as const;
type SensorState = (typeof SENSOR_STATES)[number];

/** โหมด lite ตัด array สองชุดใหญ่ออกจากรายการแปลง เพื่อลดขนาด response */
type LiteFarmPlot = Omit<FarmPlot, 'sensors' | 'microclimate'>;
type RouteData = Omit<SmartFarmingDashboardPayload, 'farms' | 'warnings'> & {
  farms: FarmPlot[] | LiteFarmPlot[];
  warnings: string[];
};

const LITE_WARNING =
  'การตอบกลับโหมด lite (ไม่ได้ส่ง detail=1) ตัด arrays sensors[] และ microclimate[] ออกจากทุกแปลง '
  + 'หากต้องการรายการเซนเซอร์และเส้น 24 ชั่วโมงให้เพิ่ม detail=1';

/**
 * GET /api/v1/smart-farming
 *
 * ข้อมูลเกษตรอัจฉริยะและเซนเซอร์ IoT (ความชื้นดิน ไมโครไคลเมต NPK รอบน้ำ และสถานะเครือข่ายเซนเซอร์)
 * สำหรับหน้า /smart-farming — แหล่งอ้างอิงรูปแบบ: กรมชลประทาน กรมวิชาการเกษตร กรมพัฒนาที่ดิน
 * สศก. และสำนักงาน กปร./ศูนย์ศึกษาการพัฒนาเขาหินซ้อนฯ (ดู data.sources)
 *
 * พารามิเตอร์ (ทุกตัวตรวจค่า ถ้าไม่รู้จักต้องตอบ 400 INVALID_QUERY ห้ามคืนรายการว่างเงียบ ๆ):
 * - province   = รหัสจังหวัด 2 หลัก ต้องมีอยู่ใน data.provinces (77 จังหวัดตามทะเบียน)
 * - crop       = รหัสพืช ต้องมีอยู่ใน data.crops เช่น rice_wet, sugarcane, durian, pineapple
 * - moisture   = saturated | adequate | watch | deficit | critical (สถานะความชื้นเทียบช่วง WP→FC)
 * - sensorState= all | online | offline | low_battery (หมายถึงแปลงที่มีโหนดอย่างน้อยหนึ่งตัวในสถานะนั้น)
 * - q          = คำค้นหาอิสระ ทาบชื่อแปลง จังหวัด พืช เจ้าของ ระยะปลูก เนื้อดิน ระบบน้ำ
 * - detail     = 1 ให้ส่ง sensors[] และ microclimate[] (24 ชั่วโมง) กลับมาด้วย, ไม่ส่ง = โหมด lite
 * - limit      = จำนวนแปลงสูงสุดหลังกรอง ค่าเริ่มต้น 50 ไม่เกิน 200 (parsePositiveInt)
 *
 * Governance: ทุกค่าเป็น deterministic sample (sample: true) และยังไม่มีการเรียก gateway/LoRaWAN/MQTT
 * ตัวจริง meta.access = 'metadata_only', meta.dataAsOf = null เพราะไม่มี batch ตัวเลขที่ผ่านการตรวจสิทธิ์
 * generatedAt เป็นค่าคงที่ SMART_FARMING_GOVERNANCE.updatedAt จึงได้ response เหมือนเดิมทุกครั้ง
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  return handleApi(async () => {
    const payload = await buildSmartFarmingDashboard();

    const provinceParam = parseText(url, 'province', 2);
    const cropParam = parseText(url, 'crop', 40);
    const moistureParam = parseText(url, 'moisture', 20);
    const sensorStateParam = parseText(url, 'sensorState', 20);
    const queryParam = parseText(url, 'q', 120);
    const detailParam = parseText(url, 'detail', 4);
    const limit = parsePositiveInt(url.searchParams.get('limit'), 50, 200, 'limit');

    if (provinceParam && !payload.provinces.some((province) => province.code === provinceParam)) {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'ไม่พบรหัสจังหวัดที่ระบุ: ' + provinceParam + ' (ต้องมีอยู่ในรายการ 77 จังหวัดของ data.provinces)',
      );
    }
    if (cropParam && !payload.crops.some((crop) => crop.id === cropParam)) {
      throw new HubRequestError(
        400,
        'INVALID_QUERY',
        'ไม่พบรหัสพืชที่ระบุ: ' + cropParam + ' (รหัสที่ใช้ได้: ' + payload.crops.map((crop) => crop.id).join(', ') + ')',
      );
    }
    let moistureStatus: MoistureStatus | undefined;
    if (moistureParam) {
      const matched = MOISTURE_STATUSES.find((status) => status === moistureParam);
      if (!matched) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'สถานะความชื้นไม่ถูกต้อง: ' + moistureParam + ' (ใช้ได้: ' + MOISTURE_STATUSES.join(', ') + ')',
        );
      }
      moistureStatus = matched;
    }

    let sensorState: SensorState | undefined;
    if (sensorStateParam) {
      const matched = SENSOR_STATES.find((state) => state === sensorStateParam);
      if (!matched) {
        throw new HubRequestError(
          400,
          'INVALID_QUERY',
          'สถานะเซนเซอร์ไม่ถูกต้อง: ' + sensorStateParam + ' (ใช้ได้: ' + SENSOR_STATES.join(', ') + ')',
        );
      }
      sensorState = matched;
    }

    const farms = await getSmartFarmingFarms({
      provinceCode: provinceParam || undefined,
      cropId: cropParam || undefined,
      moistureStatus,
      sensorState: sensorState ?? 'all',
      query: queryParam || undefined,
    });
    const capped = farms.slice(0, limit);

    const withDetail = detailParam === '1';
    const warnings = withDetail ? payload.warnings : [...payload.warnings, LITE_WARNING];
    const responseFarms: FarmPlot[] | LiteFarmPlot[] = withDetail
      ? capped
      : capped.map(({ sensors, microclimate, ...rest }) => rest);

    const data: RouteData = {
      ...payload,
      farms: responseFarms,
      warnings,
    };

    return jsonData(data, {
      meta: {
        availability: 'ready',
        freshness: 'fresh',
        completeness: 'partial',
        access: payload.access,
        sourceIds: payload.sources.map((source) => source.id),
        dataAsOf: null,
        sourceUpdatedAt: null,
        datasetVersion: SMART_FARMING_GOVERNANCE.version,
        warnings,
        runtimeMode: 'source_api_fallback',
      },
    });
  });
}
