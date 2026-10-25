'use client';

import { useMemo, useState } from 'react';
import type {
  FarmPlot,
  IrrigationPriority,
  MicroclimateHour,
  MoistureStatus,
  NextIrrigationWindow,
  SensorKind,
  SensorNode,
  SensorStatus,
  SmartFarmingDashboardPayload,
  SmartFarmingProvinceOption,
} from '@/lib/hub/smart-farming-data';
import { Icon } from './icon';
import styles from './smart-farming-dashboard.module.css';

/**
 * แดชบอร์ด "เกษตรอัจฉริยะและเซนเซอร์ IoT ในแปลงเกษตร" สำหรับหน้า /smart-farming
 *
 * - รับ `payload` จาก server component เพียงทางเดียว (โมดูลข้อมูลเป็นฝั่งเซิร์ฟเวอร์
 *   จึง import เฉพาะชนิดข้อมูลเข้ามาใน client) ไม่มีการ fetch ข้อมูลใน client
 * - ทุกตัวกรอง/การเลือกจังหวัด/การเจาะลึกแปลง ทำด้วย useMemo บน payload.farms
 * - ค่า null หมายถึง "ไม่ได้วัด" แสดงเป็น "ไม่มีข้อมูล" ห้ามแปลงเป็น 0
 * - เวลาอ้างอิงทั้งหมดใช้ payload.generatedAt เป็นนาฬิกามาตรฐาน
 *   ไม่เรียก Date.now() ขณะเรนเดอร์ เพื่อป้องกัน hydration เพี้ยน
 */

export interface SmartFarmingDashboardProps {
  payload: SmartFarmingDashboardPayload;
}

type MoistureFilter = 'all' | MoistureStatus;
type SensorStateFilter = 'all' | 'online' | 'offline' | 'low_battery';

const NO_DATA = 'ไม่มีข้อมูล';
const LOW_BATTERY_PERCENT = 20;
const WARN_BATTERY_PERCENT = 45;
/** 1 มม. ของน้ำบนพื้นที่ 1 ไร่ ≈ 1.6 ลูกบาศก์เมตร (ค่าคงที่เชิงเกษตรศาสตร์ ใช้ประมาณการเท่านั้น) */
const CUBIC_METER_PER_MM_PER_RAI = 1.6;

const MOISTURE_LABEL: Record<MoistureStatus, string> = {
  saturated: 'อิ่มน้ำ',
  adequate: 'พอเหมาะ',
  watch: 'เฝ้าระวัง',
  deficit: 'ขาดน้ำ',
  critical: 'วิกฤต',
};

const MOISTURE_CHIP: Record<MoistureStatus, string> = {
  saturated: styles.chipSaturated,
  adequate: styles.chipAdequate,
  watch: styles.chipWatch,
  deficit: styles.chipDeficit,
  critical: styles.chipCritical,
};

const GAUGE_ARC_CLASS: Record<MoistureStatus, string> = {
  saturated: styles.gaugeArcSaturated,
  adequate: styles.gaugeArcAdequate,
  watch: styles.gaugeArcWatch,
  deficit: styles.gaugeArcDeficit,
  critical: styles.gaugeArcCritical,
};

const MOISTURE_FILTER_ORDER: MoistureStatus[] = ['critical', 'deficit', 'watch', 'adequate', 'saturated'];

const SENSOR_STATUS_LABEL: Record<SensorStatus, string> = {
  online: 'ออนไลน์',
  offline: 'ขาดการเชื่อมต่อ',
  low_battery: 'แบตเตอรี่ต่ำ',
  maintenance: 'อยู่ระหว่างซ่อมบำรุง',
};

const SENSOR_STATUS_PILL: Record<SensorStatus, string> = {
  online: styles.pillOnline,
  offline: styles.pillOffline,
  low_battery: styles.pillBattery,
  maintenance: styles.pillMaintenance,
};

const SENSOR_KIND_LABEL: Record<SensorKind, string> = {
  soil_moisture: 'ความชื้นดิน',
  air_temperature: 'อุณหภูมิอากาศ',
  relative_humidity: 'ความชื้นสัมพัทธ์',
  par_light: 'แสงสว่าง (PAR)',
  npk: 'ธาตุอาหาร NPK ในดิน',
  water_flow: 'อัตราการไหลของน้ำ',
  rainfall: 'ปริมาณน้ำฝน',
};

const PRIORITY_LABEL: Record<IrrigationPriority, string> = {
  now: 'ควรให้น้ำทันที',
  today: 'ควรให้น้ำวันนี้',
  scheduled: 'ตามรอบที่กำหนด',
  skip: 'งดให้น้ำรอบนี้',
};

const PRIORITY_CHIP: Record<IrrigationPriority, string> = {
  now: styles.chipPriorityNow,
  today: styles.chipPriorityToday,
  scheduled: styles.chipPriorityScheduled,
  skip: styles.chipPrioritySkip,
};

const FARM_TYPE_LABEL: Record<FarmPlot['farmType'], string> = {
  government_demo: 'แปลงตัวอย่างภาครัฐ',
  cooperative: 'แปลงสหกรณ์',
  private_demo: 'แปลงตัวอย่างเอกชน',
};

const LEVEL_LABEL: Record<FarmPlot['npk']['level'], string> = {
  low: 'ต่ำ',
  optimal: 'เหมาะสม',
  high: 'สูง',
};

const LEVEL_CLASS: Record<FarmPlot['npk']['level'], string> = {
  low: styles.levelLow,
  optimal: styles.levelOptimal,
  high: styles.levelHigh,
};

const NPK_BAR_CLASS: Record<FarmPlot['npk']['level'], string> = {
  low: styles.npkBarLow,
  optimal: styles.npkBar,
  high: styles.npkBarHigh,
};

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const oneDecimalFormatter = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const shortDecimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const clockFormatter = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});
const dayFormatter = new Intl.DateTimeFormat('th-TH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});
const stampFormatter = new Intl.DateTimeFormat('th-TH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

function parseInstant(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatCount(value: number | null): string {
  return value === null || !Number.isFinite(value) ? NO_DATA : intFormatter.format(value);
}

function formatDecimal(value: number | null): string {
  return value === null || !Number.isFinite(value) ? NO_DATA : shortDecimalFormatter.format(value);
}

/** แสดง "ไม่มีข้อมูล" เมื่อค่าเป็น null เท่านั้น ไม่แทนด้วย 0 */
function formatMeasured(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  return `${shortDecimalFormatter.format(value)} ${unit}`.trim();
}

function formatClock(value: string): string {
  const ms = parseInstant(value);
  return ms === null ? NO_DATA : `${clockFormatter.format(new Date(ms))} น.`;
}

function formatDay(value: string): string {
  const ms = parseInstant(value);
  return ms === null ? NO_DATA : dayFormatter.format(new Date(ms));
}

function formatStamp(value: string): string {
  const ms = parseInstant(value);
  return ms === null ? NO_DATA : stampFormatter.format(new Date(ms));
}

/** เวลาเทียบกลับแบบไทย คำนวณจากนาฬิกามาตรฐานของรอบสร้างรายงาน (ไม่ใช่เวลาระบบ) */
function formatRelative(value: string, referenceMs: number | null): string {
  const ms = parseInstant(value);
  if (ms === null || referenceMs === null) return NO_DATA;
  const diffMinutes = Math.round((referenceMs - ms) / 60000);
  if (diffMinutes <= 0) return 'ส่งรอบล่าสุด';
  if (diffMinutes === 1) return '1 นาทีที่แล้ว';
  if (diffMinutes < 60) return `${intFormatter.format(diffMinutes)} นาทีที่แล้ว`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${intFormatter.format(hours)} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${intFormatter.format(days)} วันที่แล้ว`;
  return `${intFormatter.format(Math.floor(days / 30))} เดือนที่แล้ว`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

/** ตัวเลือกจังหวัดทั้ง 77 รายการจัดกลุ่มตาม regionLabel ของหน่วยงานต้นทาง เรียงภาคคงที่ */
const REGION_RANK: Record<SmartFarmingProvinceOption['regionKey'], number> = {
  north: 1,
  northeast: 2,
  central: 3,
  east: 4,
  south: 5,
};

type ProvinceGroup = {
  key: SmartFarmingProvinceOption['regionKey'];
  label: string;
  options: SmartFarmingProvinceOption[];
};

function groupProvinces(
  provinces: SmartFarmingProvinceOption[],
  searchText: string,
  selectedCode: string,
): ProvinceGroup[] {
  const needle = searchText.trim().toLowerCase();
  const visible = provinces.filter((province) => {
    const matches =
      needle === '' ||
      province.name.toLowerCase().includes(needle) ||
      province.code.toLowerCase().includes(needle) ||
      province.regionLabel.toLowerCase().includes(needle);
    // ยังคงรายการที่เลือกไว้ให้เลือกได้ แม้พิมพ์แล้วไม่ตรง เพื่อไม่ให้ค่าของ <select> หลุดจากรายการ
    return matches || province.code === selectedCode;
  });

  const groups: ProvinceGroup[] = [];
  visible.forEach((province) => {
    const found = groups.find((group) => group.key === province.regionKey);
    if (found) {
      found.options.push(province);
      return;
    }
    groups.push({
      key: province.regionKey,
      label: province.regionLabel,
      options: [province],
    });
  });

  groups.sort((a, b) => REGION_RANK[a.key] - REGION_RANK[b.key]);
  groups.forEach((group) => group.options.sort((a, b) => a.code.localeCompare(b.code, 'th')));
  return groups;
}

function matchesSensorState(farm: FarmPlot, state: SensorStateFilter): boolean {
  if (state === 'all') return true;
  if (state === 'online') return farm.sensorOnline > 0 || farm.sensors.some((s) => s.status === 'online');
  if (state === 'offline') return farm.sensorOffline > 0 || farm.sensors.some((s) => s.status === 'offline');
  return (
    farm.lowBatteryCount > 0 ||
    farm.sensors.some((s) => s.status === 'low_battery' || s.batteryPercent <= LOW_BATTERY_PERCENT)
  );
}

function matchesText(farm: FarmPlot, rawQuery: string): boolean {
  const needle = rawQuery.trim().toLowerCase();
  if (needle === '') return true;
  return [
    farm.farmName,
    farm.provinceName,
    farm.districtLabel,
    farm.cropName,
    farm.ownerAgency,
    farm.growthStage,
    farm.irrigationSystem,
    farm.soilTexture,
  ].some((field) => field.toLowerCase().includes(needle));
}

type ScopedStats = {
  farmCount: number;
  provinceCount: number;
  sensorTotal: number;
  sensorOnline: number;
  sensorOffline: number;
  lowBattery: number;
  avgMoisture: number | null;
  avgEt0: number | null;
  totalAreaRai: number;
  needNow: number;
  needToday: number;
  skip: number;
};

/** ตัวเลข KPI ทั้งหมดคำนวณจากแปลงที่ผ่านตัวกรองปัจจุบัน (ค่าเฉลี่ยไม่มีแปลง = null ไม่ใช่ 0) */
function deriveStats(farms: FarmPlot[]): ScopedStats {
  const moistureValues: number[] = [];
  const et0Values: number[] = [];
  let sensorTotal = 0;
  let sensorOnline = 0;
  let sensorOffline = 0;
  let lowBattery = 0;
  let totalAreaRai = 0;
  let needNow = 0;
  let needToday = 0;
  let skip = 0;

  farms.forEach((farm) => {
    sensorTotal += farm.sensorTotal;
    sensorOnline += farm.sensorOnline;
    sensorOffline += farm.sensorOffline;
    lowBattery += farm.lowBatteryCount;
    totalAreaRai += farm.areaRai;
    if (Number.isFinite(farm.soilMoisturePercent)) moistureValues.push(farm.soilMoisturePercent);
    if (Number.isFinite(farm.et0TodayMm)) et0Values.push(farm.et0TodayMm);
    if (farm.nextIrrigation.priority === 'now') needNow += 1;
    if (farm.nextIrrigation.priority === 'today') needToday += 1;
    if (farm.nextIrrigation.priority === 'skip') skip += 1;
  });

  return {
    farmCount: farms.length,
    provinceCount: new Set(farms.map((farm) => farm.provinceCode)).size,
    sensorTotal,
    sensorOnline,
    sensorOffline,
    lowBattery,
    avgMoisture: average(moistureValues),
    avgEt0: average(et0Values),
    totalAreaRai,
    needNow,
    needToday,
    skip,
  };
}

export function SmartFarmingDashboard({ payload }: SmartFarmingDashboardProps) {
  const [provinceCode, setProvinceCode] = useState<string>('all');
  const [provinceQuery, setProvinceQuery] = useState<string>('');
  const [cropId, setCropId] = useState<string>('all');
  const [moistureFilter, setMoistureFilter] = useState<MoistureFilter>('all');
  const [sensorState, setSensorState] = useState<SensorStateFilter>('all');
  const [query, setQuery] = useState<string>('');
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);

  const referenceMs = useMemo(() => parseInstant(payload.generatedAt), [payload.generatedAt]);

  const provinceGroups = useMemo(
    () => groupProvinces(payload.provinces, provinceQuery, provinceCode),
    [payload.provinces, provinceQuery, provinceCode],
  );

  const farms = useMemo(
    () =>
      payload.farms.filter(
        (farm) =>
          (provinceCode === 'all' || farm.provinceCode === provinceCode) &&
          (cropId === 'all' || farm.cropId === cropId) &&
          (moistureFilter === 'all' || farm.moistureStatus === moistureFilter) &&
          matchesSensorState(farm, sensorState) &&
          matchesText(farm, query),
      ),
    [payload.farms, provinceCode, cropId, moistureFilter, sensorState, query],
  );

  const stats = useMemo(() => deriveStats(farms), [farms]);

  // แปลงที่เปิดดูรายละเอียด: เลือกตาม card ที่กด ถ้าไม่ได้เลือกหรือถูกกรองหาย ก็ใช้แปลงแรกของรายการ
  const activeFarm = useMemo(
    () => farms.find((farm) => farm.farmId === selectedFarmId) ?? farms[0] ?? null,
    [farms, selectedFarmId],
  );

  const hasActiveFilter =
    provinceCode !== 'all' ||
    cropId !== 'all' ||
    moistureFilter !== 'all' ||
    sensorState !== 'all' ||
    query.trim() !== '' ||
    provinceQuery.trim() !== '';

  function resetFilters() {
    setProvinceCode('all');
    setProvinceQuery('');
    setCropId('all');
    setMoistureFilter('all');
    setSensorState('all');
    setQuery('');
    setSelectedFarmId(null);
  }

  return (
    <div className={styles.container}>
      <GovernanceBanner payload={payload} referenceMs={referenceMs} />

      <section className={styles.leadPanel} aria-label="บทสรุปของรอบข้อมูล">
        <h2 className={styles.leadTitle}>{payload.summary.headline}</h2>
        <p className={styles.leadText}>{payload.summary.subheadline}</p>
      </section>

      <section className={styles.section} aria-label="ตัวชี้วัดภาพรวมตามตัวกรองปัจจุบัน">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>ภาพรวมตามขอบเขตที่เลือก</span>
            <h2 className={styles.sectionTitle}>ตัวชี้วัดเกษตรอัจฉริยะ</h2>
          </div>
          <span className={styles.sectionMeta}>
            {hasActiveFilter ? 'ตัวเลขคำนวณจากแปลงที่ผ่านตัวกรอง' : 'ตัวเลขคำนวณจากแปลงตัวอย่างทั้งหมดในชุดข้อมูล'}
          </span>
        </header>
        <KpiStrip stats={stats} payload={payload} filtered={hasActiveFilter} />
      </section>

      <section className={styles.filterCard} aria-label="ตัวกรองแปลงเซนเซอร์">
        <div className={styles.filterGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sf-province-search">
              พิมพ์เพื่อค้นหาจังหวัด
            </label>
            <span className={styles.searchField}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                id="sf-province-search"
                type="search"
                className={`${styles.control} ${styles.searchInput}`}
                value={provinceQuery}
                onChange={(event) => setProvinceQuery(event.target.value)}
                placeholder="เช่น ขอนแก่น / เชียงใหม่"
                aria-label="พิมพ์ชื่อจังหวัดเพื่อลดรายการจังหวัดในช่องเลือกจังหวัด"
              />
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sf-province">
              จังหวัด (กลุ่มอ้างอิง 77 จังหวัด)
            </label>
            <select
              id="sf-province"
              className={styles.control}
              value={provinceCode}
              onChange={(event) => setProvinceCode(event.target.value)}
              aria-label="เลือกจังหวัดเพื่อกรองแปลงเซนเซอร์"
            >
              <option value="all">ทุกจังหวัด ({payload.provinces.length} รายการ)</option>
              {provinceGroups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.options.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.code} · {province.name} ({province.farmCount} แปลง)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sf-crop">
              ชนิดพืช
            </label>
            <select
              id="sf-crop"
              className={styles.control}
              value={cropId}
              onChange={(event) => setCropId(event.target.value)}
              aria-label="เลือกชนิดพืชเพื่อกรองแปลงเซนเซอร์"
            >
              <option value="all">ทุกชนิดพืช ({payload.crops.length} รายการ)</option>
              {payload.crops.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.name} ({crop.farmCount} แปลง)
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sf-moisture">
              สถานะความชื้นดิน
            </label>
            <select
              id="sf-moisture"
              className={styles.control}
              value={moistureFilter}
              onChange={(event) => setMoistureFilter(event.target.value as MoistureFilter)}
              aria-label="เลือกสถานะความชื้นดินเพื่อกรองแปลง"
            >
              <option value="all">ทุกสถานะความชื้น</option>
              {MOISTURE_FILTER_ORDER.map((status) => (
                <option key={status} value={status}>
                  {MOISTURE_LABEL[status]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sf-sensor">
              สถานะเซนเซอร์
            </label>
            <select
              id="sf-sensor"
              className={styles.control}
              value={sensorState}
              onChange={(event) => setSensorState(event.target.value as SensorStateFilter)}
              aria-label="เลือกสถานะเซนเซอร์เพื่อกรองแปลงที่มีอุปกรณ์ในสภาพนั้นอย่างน้อยหนึ่งตัว"
            >
              <option value="all">ทุกสถานะเซนเซอร์</option>
              <option value="online">มีเซนเซอร์ออนไลน์</option>
              <option value="offline">มีเซนเซอร์ขาดการเชื่อมต่อ</option>
              <option value="low_battery">มีเซนเซอร์แบตเตอรี่ต่ำ</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sf-query">
              ค้นชื่อแปลง / อำเภอ / พืช / ระบบน้ำ
            </label>
            <span className={styles.searchField}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                id="sf-query"
                type="search"
                className={`${styles.control} ${styles.searchInput}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="เช่น ข้าวโพด / สาธิต / สปริงเกลอร์"
                aria-label="ค้นหาชื่อแปลง อำเภอชนิดพืช หรือระบบให้น้ำ"
              />
            </span>
          </div>
        </div>

        <div className={styles.filterFooter}>
          <span className={styles.filterSummary} role="status" aria-live="polite">
            <span>
              ตรงกับตัวกรอง <strong>{intFormatter.format(farms.length)}</strong> จาก{' '}
              {intFormatter.format(payload.farms.length)} แปลงในชุดตัวอย่าง
            </span>
            {activeFarm ? (
              <span className={styles.selectedChip}>กำลังแสดง: {activeFarm.farmName}</span>
            ) : null}
          </span>
          <button
            type="button"
            className={styles.resetButton}
            onClick={resetFilters}
            disabled={!hasActiveFilter}
            aria-label="ล้างตัวกรองทั้งหมด กลับไปดูทุกแปลง"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </section>

      <section className={styles.section} aria-label="รายการแปลงเซนเซอร์">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>สถานะอุปกรณ์รายแปลง</span>
            <h2 className={styles.sectionTitle}>แปลงเกษตรอัจฉริยะที่ติดตาม</h2>
          </div>
          <span className={styles.sectionMeta}>เลือกบัตรแปลงเพื่อดู gauge กราฟและตารางเซนเซอร์</span>
        </header>

        {farms.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <Icon name="search" size={26} />
            <p className={styles.emptyTitle}>ไม่พบแปลงที่ตรงกับตัวกรอง</p>
            <p className={styles.emptyText}>
              ลองเลือกจังหวัดหรือชนิดพืชอื่น หรือล้างตัวกรองเพื่อกลับไปแสดงทุกแปลงในชุดตัวอย่าง
            </p>
            <button type="button" className={styles.resetButton} onClick={resetFilters}>
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        ) : (
          <div className={styles.farmGrid}>
            {farms.map((farm) => (
              <FarmCard
                key={farm.farmId}
                farm={farm}
                isActive={activeFarm?.farmId === farm.farmId}
                referenceMs={referenceMs}
                onSelect={setSelectedFarmId}
              />
            ))}
          </div>
        )}
      </section>

      {activeFarm ? <FarmDetail farm={activeFarm} referenceMs={referenceMs} /> : null}

      <SourceSection payload={payload} />
    </div>
  );
}

/** แถบกำกับดูแลข้อมูล: ตัวเลขทั้งหมดเป็นค่าจำลอง ต้องเห็นก่อนเห็นข้อมูล */
function GovernanceBanner({
  payload,
  referenceMs,
}: {
  payload: SmartFarmingDashboardPayload;
  referenceMs: number | null;
}) {
  return (
    <aside className={styles.banner} role="status" aria-label="ประกาศสถานะข้อมูลตัวอย่าง">
      <Icon name="info" size={21} className={styles.bannerIcon} />
      <span className={styles.bannerBody}>
        <span className={styles.bannerTop}>
          <span className={styles.bannerBadge}>ข้อมูลตัวอย่าง · metadata_only</span>
          <span className={styles.bannerHeadline}>{payload.bannerText}</span>
        </span>
        <span className={styles.bannerText}>{payload.disclaimer}</span>
        <ul className={styles.bannerMeta}>
          <li className={styles.metaChip}>sample: true</li>
          <li className={styles.metaChip}>access: {payload.access}</li>
          <li className={styles.metaChip}>สร้างรอบเมื่อ {formatStamp(payload.generatedAt)}</li>
          <li className={styles.metaChip}>วันที่รายงาน {formatDay(payload.summary.reportDate)}</li>
        </ul>

        {payload.warnings.length > 0 ? (
          <details className={styles.details}>
            <summary className={styles.detailsSummary}>
              ข้อควรระวังของชุดข้อมูลนี้ ({intFormatter.format(payload.warnings.length)} รายการ)
            </summary>
            <ul className={styles.warningList}>
              {payload.warnings.map((warning) => (
                <li key={warning} className={styles.warningItem}>
                  {warning}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <span className={styles.panelNote}>
          เวลาเทียบกลับของเซนเซอร์ทุกตัวในหน้านี้คำนวณจากรอบสร้างรายงานเดียวกัน
          {referenceMs === null ? ' (ไม่ระบุเวลาอ้างอิง)' : ''}
        </span>
      </span>
    </aside>
  );
}

function KpiStrip({
  stats,
  payload,
  filtered,
}: {
  stats: ScopedStats;
  payload: SmartFarmingDashboardPayload;
  filtered: boolean;
}) {
  const summary = payload.summary;

  return (
    <>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="layers" size={14} /> แปลงที่ติดตาม
          </span>
          <span className={styles.kpiValue}>
            {formatCount(stats.farmCount)} <span className={styles.kpiUnit}>แปลง</span>
          </span>
          <span className={styles.kpiSub}>
            จากชุดตัวอย่าง {formatCount(summary.totalFarms)} แปลง
            {filtered ? ' (ตัวกรองปัจจุบัน)' : ''}
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="pin" size={14} /> จังหวัดในขอบเขต
          </span>
          <span className={styles.kpiValue}>
            {formatCount(stats.provinceCount)} <span className={styles.kpiUnit}>จาก 77 จังหวัด</span>
          </span>
          <span className={styles.kpiSub}>กลุ่มจังหวัดเป็นหมุดอ้างอิง ไม่ใช่ขอบเขตครอบคลุมข้อมูล</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="sun" size={14} /> เซนเซอร์ทั้งหมด
          </span>
          <span className={styles.kpiValue}>
            {formatCount(stats.sensorTotal)} <span className={styles.kpiUnit}>ตัว</span>
          </span>
          <span className={styles.kpiSub}>ทั้งประเทศในชุดตัวอย่าง {formatCount(summary.totalSensors)} ตัว</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="chart" size={14} /> ออนไลน์ / ขาดการเชื่อมต่อ
          </span>
          <span className={styles.kpiValue}>
            {formatCount(stats.sensorOnline)} <span className={styles.kpiUnit}>ตัว</span>
          </span>
          <span className={styles.kpiSub}>
            <span className={styles.kpiSplit}>ออฟไลน์ {formatCount(stats.sensorOffline)} ตัว</span>
            <span>ออนไลน์ทั้งประเทศ {formatCount(summary.onlineSensors)} ตัว</span>
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="lock" size={14} /> แบตเตอรี่ต่ำ
          </span>
          <span className={styles.kpiValue}>
            {formatCount(stats.lowBattery)} <span className={styles.kpiUnit}>ตัว (&le; {LOW_BATTERY_PERCENT}%)</span>
          </span>
          <span className={styles.kpiSub}>ทั้งชุดตัวอย่าง {formatCount(summary.lowBatterySensors)} ตัว</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="water" size={14} /> ความชื้นดินเฉลี่ย
          </span>
          <span className={styles.kpiValue}>
            {stats.avgMoisture === null ? NO_DATA : `${oneDecimalFormatter.format(stats.avgMoisture)} %`}
          </span>
          <span className={styles.kpiSub}>ค่าเฉลี่ยไม่ถ่วงน้ำหนักพื้นที่ ของแปลงที่แสดง</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="sun" size={14} /> ET0 เฉลี่ยวันนี้
          </span>
          <span className={styles.kpiValue}>
            {stats.avgEt0 === null ? NO_DATA : `${oneDecimalFormatter.format(stats.avgEt0)} มม.`}
          </span>
          <span className={styles.kpiSub}>
            ทั้งชุดตัวอย่าง {formatDecimal(summary.avgEt0Mm)} มม. · อุณหภูมิเฉลี่ย{' '}
            {formatDecimal(summary.avgAirTempC)} °C
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="leaf" size={14} /> พื้นที่ในขอบเขต
          </span>
          <span className={styles.kpiValue}>
            {formatCount(stats.totalAreaRai)} <span className={styles.kpiUnit}>ไร่</span>
          </span>
          <span className={styles.kpiSub}>
            ต้องน้ำทันที {formatCount(stats.needNow)} · วันนี้ {formatCount(stats.needToday)} · งด{' '}
            {formatCount(stats.skip)} แปลง
          </span>
        </div>
      </div>

      <p className={styles.kpiFootnote}>
        <Icon name="info" size={15} />
        <span>{summary.coverageNote}</span>
      </p>
    </>
  );
}

function batteryToneClass(percent: number): string {
  const tone =
    percent <= LOW_BATTERY_PERCENT
      ? styles.batteryLow
      : percent <= WARN_BATTERY_PERCENT
        ? styles.batteryMid
        : '';
  return `${styles.batteryFill} ${tone}`.trim();
}

/** แบตเตอรี่ที่แสดงในบัตรแปลง = ค่าเฉลี่ยของอุปกรณ์ในแปลง (null เมื่อไม่มีรายการเซนเซอร์) */
function farmBatteryPercent(farm: FarmPlot): number | null {
  return average(farm.sensors.map((sensor) => sensor.batteryPercent));
}

/** ช่วงเวลาที่รับส่งข้อมูลได้ล่าสุดในแปลง — ใช้เวลาของเซนเซอร์ที่ใหม่ที่สุด */
function farmLatestSeen(farm: FarmPlot): string | null {
  let bestMs: number | null = null;
  let bestIso: string | null = null;
  farm.sensors.forEach((sensor) => {
    const ms = parseInstant(sensor.lastSeenAt);
    if (ms === null) return;
    if (bestMs === null || ms > bestMs) {
      bestMs = ms;
      bestIso = sensor.lastSeenAt;
    }
  });
  return bestIso;
}

function FarmCard({
  farm,
  isActive,
  referenceMs,
  onSelect,
}: {
  farm: FarmPlot;
  isActive: boolean;
  referenceMs: number | null;
  onSelect: (farmId: string) => void;
}) {
  const battery = farmBatteryPercent(farm);
  const latestSeen = farmLatestSeen(farm);
  const offlineShare = farm.sensorTotal > 0 ? farm.sensorOffline / farm.sensorTotal : 0;

  return (
    <button
      type="button"
      className={`${styles.farmCard} ${isActive ? styles.farmCardActive : ''}`}
      onClick={() => onSelect(farm.farmId)}
      aria-pressed={isActive}
      aria-label={`เปิดรายละเอียดแปลง ${farm.farmName} ตำบล ${farm.districtLabel} จังหวัด ${farm.provinceName}`}
    >
      <span className={styles.farmCardTop}>
        <span className={styles.farmName}>{farm.farmName}</span>
        <span className={styles.farmTypeBadge}>{FARM_TYPE_LABEL[farm.farmType]}</span>
      </span>

      <span className={styles.farmSub}>
        <Icon name="pin" size={13} />
        <span>
          {farm.districtLabel} · {farm.provinceName} ({farm.regionLabel})
        </span>
      </span>

      <span className={styles.farmMetaRow}>
        <span>
          {farm.cropName} · <strong>{farm.growthStage}</strong>
        </span>
        <span>{formatCount(farm.areaRai)} ไร่</span>
        <span>{farm.irrigationSystem}</span>
        <span>{farm.soilTexture}</span>
      </span>

      <span className={styles.statusRow}>
        <span className={styles.countCell}>
          <strong>{formatCount(farm.sensorOnline)}</strong>
          <span>/ {formatCount(farm.sensorTotal)} ออนไลน์</span>
        </span>
        <span className={`${styles.countCell} ${offlineShare > 0 ? styles.countOffline : ''}`}>
          <strong>{formatCount(farm.sensorOffline)}</strong>
          <span>ออฟไลน์</span>
        </span>
        <span className={styles.batteryRow}>
          <span className={styles.batteryTrack}>
            <span
              className={battery === null ? styles.batteryFill : batteryToneClass(battery)}
              style={{ width: `${battery === null ? 0 : clampPercent(battery)}%` }}
            />
          </span>
          <span className={battery !== null && battery <= LOW_BATTERY_PERCENT ? styles.batteryLabelLow : styles.batteryLabel}>
            {battery === null ? NO_DATA : `${intFormatter.format(Math.round(battery))}%`}
          </span>
        </span>
        <span className={styles.seenCell}>
          {latestSeen === null ? NO_DATA : formatRelative(latestSeen, referenceMs)}
        </span>
      </span>

      <span className={styles.chipRow}>
        <span className={`${styles.chip} ${MOISTURE_CHIP[farm.moistureStatus]}`}>
          {Number.isFinite(farm.soilMoisturePercent)
            ? `ความชื้นดิน ${formatDecimal(farm.soilMoisturePercent)} % · ${MOISTURE_LABEL[farm.moistureStatus]}`
            : `ความชื้นดิน ${NO_DATA}`}
        </span>
        <span className={`${styles.chip} ${PRIORITY_CHIP[farm.nextIrrigation.priority]}`}>
          {PRIORITY_LABEL[farm.nextIrrigation.priority]}
        </span>
        {farm.lowBatteryCount > 0 ? (
          <span className={`${styles.chip} ${styles.chipWatch}`}>
            แบตเตอรี่ต่ำ {formatCount(farm.lowBatteryCount)} ตัว
          </span>
        ) : null}
      </span>
    </button>
  );
}

/* เรขาคณิตของมาตรวัดแบบวงเปิด 270° (ช่องว่างอยู่ด้านล่าง) */
const GAUGE_START_DEG = 135;
const GAUGE_SWEEP_DEG = 270;

function polarPoint(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const start = polarPoint(cx, cy, r, fromDeg);
  const end = polarPoint(cx, cy, r, toDeg);
  const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function gaugeAngle(percent: number): number {
  return GAUGE_START_DEG + GAUGE_SWEEP_DEG * (clampPercent(percent) / 100);
}

function FarmDetail({ farm, referenceMs }: { farm: FarmPlot; referenceMs: number | null }) {
  return (
    <section className={styles.section} aria-label={`รายละเอียดแปลง ${farm.farmName}`}>
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>เจาะลึกแปลงที่เลือก</span>
          <h2 className={styles.sectionTitle}>{farm.farmName}</h2>
        </div>
        <span className={styles.sectionMeta}>
          {farm.ownerAgency} · ปลูกเมื่อ {formatDay(farm.plantDate)} · {farm.cropName} ({farm.growthStage}) ·{' '}
          {formatCount(farm.areaRai)} ไร่
        </span>
      </header>

      <div className={styles.detailGrid}>
        <MoistureGauge farm={farm} />
        <IrrigationPanel farm={farm} />
        <NpkPanel farm={farm} />
      </div>

      <div className={styles.chartRow}>
        <MicroclimateChart hours={farm.microclimate} farmName={farm.farmName} />
        <MicroclimateStats farm={farm} />
      </div>

      <SensorTable farm={farm} referenceMs={referenceMs} />
    </section>
  );
}

/** มาตรวัดความชื้นดิน 270° พร้อมจุดเหี่ยว/ความจุสนาม และแถบค่าที่ลงสีตาม moistureStatus */
function MoistureGauge({ farm }: { farm: FarmPlot }) {
  const cx = 100;
  const cy = 94;
  const r = 70;
  const gaugePercent = farm.moistureGaugePercent;
  const hasValue = Number.isFinite(gaugePercent);
  const valueEnd = gaugeAngle(gaugePercent);
  const arcClass = GAUGE_ARC_CLASS[farm.moistureStatus];

  const wiltingAngle = gaugeAngle(farm.wiltingPointPercent);
  const capacityAngle = gaugeAngle(farm.fieldCapacityPercent);
  const wiltingInner = polarPoint(cx, cy, r - 10, wiltingAngle);
  const wiltingOuter = polarPoint(cx, cy, r + 12, wiltingAngle);
  const capacityInner = polarPoint(cx, cy, r - 10, capacityAngle);
  const capacityOuter = polarPoint(cx, cy, r + 12, capacityAngle);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>มาตรวัดความชื้นดิน</h3>
        <span className={styles.panelMeta}>{farm.soilTexture}</span>
      </div>

      <div className={styles.gaugeWrap}>
        <svg
          viewBox="0 0 200 172"
          className={styles.gaugeSvg}
          role="img"
          aria-label={
            hasValue
              ? `มาตรวัดความชื้นดิน ${formatDecimal(gaugePercent)} เปอร์เซ็นต์ของช่วงใช้งาน สถานะ ${MOISTURE_LABEL[farm.moistureStatus]}`
              : 'มาตรวัดความชื้นดินไม่มีข้อมูล'
          }
        >
          <path d={arcPath(cx, cy, r, GAUGE_START_DEG, GAUGE_START_DEG + GAUGE_SWEEP_DEG)} className={styles.gaugeTrackArc} />

          {hasValue && clampPercent(gaugePercent) > 0 ? (
            <path
              d={arcPath(cx, cy, r, GAUGE_START_DEG, valueEnd)}
              className={`${styles.gaugeValueArc} ${arcClass}`}
            />
          ) : null}

          {!hasValue ? (
            <path
              d={arcPath(cx, cy, r, GAUGE_START_DEG, GAUGE_START_DEG + GAUGE_SWEEP_DEG)}
              className={styles.gaugeArcUnknown}
            />
          ) : null}

          {/* เข็มหมายจุดเหี่ยวและความจุสนาม */}
          <line
            x1={wiltingInner.x.toFixed(1)}
            y1={wiltingInner.y.toFixed(1)}
            x2={polarPoint(cx, cy, r + 10, wiltingAngle).x.toFixed(1)}
            y2={polarPoint(cx, cy, r + 10, wiltingAngle).y.toFixed(1)}
            className={styles.gaugeTick}
          />
          <line
            x1={capacityInner.x.toFixed(1)}
            y1={capacityInner.y.toFixed(1)}
            x2={polarPoint(cx, cy, r + 10, capacityAngle).x.toFixed(1)}
            y2={polarPoint(cx, cy, r + 10, capacityAngle).y.toFixed(1)}
            className={styles.gaugeTick}
          />
          <text
            x={wiltingOuter.x.toFixed(1)}
            y={(wiltingOuter.y - 2).toFixed(1)}
            textAnchor={wiltingOuter.x < cx ? 'end' : 'start'}
            className={styles.gaugeTickLabel}
          >
            จุดเหี่ยว {formatDecimal(farm.wiltingPointPercent)}%
          </text>
          <text
            x={capacityOuter.x.toFixed(1)}
            y={(capacityOuter.y - 2).toFixed(1)}
            textAnchor={capacityOuter.x < cx ? 'end' : 'start'}
            className={styles.gaugeTickLabel}
          >
            ความจุสนาม {formatDecimal(farm.fieldCapacityPercent)}%
          </text>

          <text x={cx} y={cy + 4} textAnchor="middle" className={styles.gaugeNumber}>
            {hasValue ? formatDecimal(gaugePercent) : '—'}
          </text>
          <text x={cx} y={cy + 20} textAnchor="middle" className={styles.gaugeUnit}>
            % ของช่วงน้ำที่ใช้ได้
          </text>
          <text x={cx} y={cy + 38} textAnchor="middle" className={styles.gaugeCaption}>
            {hasValue ? MOISTURE_LABEL[farm.moistureStatus] : NO_DATA}
          </text>
        </svg>
      </div>

      <div className={styles.gaugeReadouts}>
        <div className={styles.readout}>
          <span className={styles.readoutLabel}>ความชื้นดินวัดได้</span>
          <span className={styles.readoutValue}>
            {formatDecimal(farm.soilMoisturePercent)} <span className={styles.readoutUnit}>%</span>
          </span>
        </div>
        <div className={styles.readout}>
          <span className={styles.readoutLabel}>น้ำที่พืชดึงใช้ได้</span>
          <span className={styles.readoutValue}>
            {formatDecimal(farm.availableWaterPercent)} <span className={styles.readoutUnit}>%</span>
          </span>
        </div>
        <div className={styles.readout}>
          <span className={styles.readoutLabel}>ความจุสนาม (FC)</span>
          <span className={styles.readoutValue}>
            {formatDecimal(farm.fieldCapacityPercent)} <span className={styles.readoutUnit}>%</span>
          </span>
        </div>
        <div className={styles.readout}>
          <span className={styles.readoutLabel}>จุดเหี่ยวถาวร (WP)</span>
          <span className={styles.readoutValue}>
            {formatDecimal(farm.wiltingPointPercent)} <span className={styles.readoutUnit}>%</span>
          </span>
        </div>
      </div>

      <span className={`${styles.chip} ${hasValue ? MOISTURE_CHIP[farm.moistureStatus] : styles.chipNeutral}`}>
        สถานะดิน: {hasValue ? MOISTURE_LABEL[farm.moistureStatus] : NO_DATA}
      </span>

      <p className={styles.panelNote}>
        เกจแสดงตำแหน่งความชื้นเทียบกับช่วงระหว่างจุดเหี่ยวถาวรกับความจุสนามของดินรายแปลง
        ค่าที่วัดไม่ได้แสดงเป็น “{NO_DATA}” ไม่ได้แทนด้วยศูนย์
      </p>
    </div>
  );
}

/** ปริมาตรน้ำโดยประมาณ: 1 มม. บน 1 ไร่ ≈ 1.6 ลูกบาศก์เมตร (ตัวเลขประมาณการ ไม่ใช่คำสั่งเปิดวาล์ว) */
function estimateWaterCubicMeters(waterMm: number, areaRai: number): number | null {
  if (!Number.isFinite(waterMm) || !Number.isFinite(areaRai)) return null;
  return waterMm * areaRai * CUBIC_METER_PER_MM_PER_RAI;
}

function lastHoursRainMm(hours: MicroclimateHour[], count: number): number | null {
  if (hours.length === 0) return null;
  const tail = hours.slice(Math.max(0, hours.length - count));
  const values = tail.map((hour) => hour.rainfallMm).filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function IrrigationPanel({ farm }: { farm: FarmPlot }) {
  const windowInfo: NextIrrigationWindow = farm.nextIrrigation;
  const priority = windowInfo.priority;
  const volumeM3 = estimateWaterCubicMeters(windowInfo.recommendedWaterMm, farm.areaRai);
  const crossesDay = formatDay(windowInfo.from) !== formatDay(windowInfo.to);
  const recentRainMm = lastHoursRainMm(farm.microclimate, 6);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>รอบให้น้ำถัดไป</h3>
        <span className={styles.panelMeta}>{farm.irrigationSystem}</span>
      </div>

      <span className={`${styles.chip} ${PRIORITY_CHIP[priority]}`}>{PRIORITY_LABEL[priority]}</span>

      <p className={styles.irrigationHeadline}>{windowInfo.label}</p>

      <p className={styles.irrigationTime}>
        <Icon name="sun" size={15} />
        <span>
          {formatClock(windowInfo.from)} – {formatClock(windowInfo.to)}
        </span>
        <span className={styles.panelMeta}>
          {formatDay(windowInfo.from)}
          {crossesDay ? ` – ${formatDay(windowInfo.to)}` : ''}
        </span>
      </p>

      <div className={styles.irrigationStats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>เวลาที่แนะนำ</span>
          <span className={styles.statValue}>
            {formatCount(windowInfo.recommendedMinutes)} <span className={styles.statUnit}>นาที</span>
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ปริมาณน้ำแนะนำ</span>
          <span className={styles.statValue}>
            {formatDecimal(windowInfo.recommendedWaterMm)} <span className={styles.statUnit}>มม.</span>
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ET0 วันนี้</span>
          <span className={styles.statValue}>
            {formatDecimal(farm.et0TodayMm)} <span className={styles.statUnit}>มม.</span>
          </span>
        </div>
      </div>

      <div className={styles.estimatePanel}>
        <span className={styles.estimateValue}>
          ประมาณการ {volumeM3 === null ? NO_DATA : `${intFormatter.format(Math.round(volumeM3))} ลูกบาศก์เมตร`}
        </span>
        <span className={styles.estimateNote}>
          คำนวณจาก {formatDecimal(windowInfo.recommendedWaterMm)} มม. × {formatCount(farm.areaRai)} ไร่ ×{' '}
          {CUBIC_METER_PER_MM_PER_RAI} ลบ.ม./มม./ไร่ ยังไม่หักประสิทธิภาพระบบน้ำและการสูญหายระหว่างทาง
        </span>
      </div>

      <p className={styles.irrigationReason}>
        {priority === 'skip'
          ? `งดรอบนี้: ${windowInfo.reason} — ฝน 6 ชั่วโมงหลังสุด ${
              recentRainMm === null ? NO_DATA : `${shortDecimalFormatter.format(recentRainMm)} มม.`
            } · ความชื้นดินสถานะ ${MOISTURE_LABEL[farm.moistureStatus]}`
          : windowInfo.reason}
      </p>

      <p className={styles.panelNote}>
        ช่วงเวลาและปริมาณน้ำเป็นผลจากแบบจำลองความชื้นดินของชุดข้อมูลตัวอย่าง
        ห้ามใช้สั่งเปิดวาล์วหรือให้น้ำจริงในแปลง
      </p>
    </div>
  );
}

function NpkPanel({ farm }: { farm: FarmPlot }) {
  const npk = farm.npk;
  const rows = [
    { key: 'nitrogen', label: 'ไนโตรเจน (N)', value: npk.nitrogenPpm },
    { key: 'phosphorus', label: 'ฟอสฟอรัส (P)', value: npk.phosphorusPpm },
    { key: 'potassium', label: 'โพแทสเซียม (K)', value: npk.potassiumPpm },
  ];
  const peak = Math.max(...rows.map((row) => (Number.isFinite(row.value) ? row.value : 0)), 1);
  const axisMax = Math.ceil(peak / 20) * 20 + 20;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>ธาตุอาหารในดิน (NPK)</h3>
        <span className={styles.panelMeta}>หน่วย ppm · ระดับ {LEVEL_LABEL[npk.level]}</span>
      </div>

      <span className={`${styles.levelTag} ${LEVEL_CLASS[npk.level]}`}>
        <Icon name="layers" size={13} />
        {`ภาพรวมธาตุอาหาร: ${LEVEL_LABEL[npk.level]}`}
      </span>

      <ul className={styles.npkRows}>
        {rows.map((row) => (
          <li key={row.key} className={styles.npkRow}>
            <span className={styles.npkName}>{row.label}</span>
            <span className={styles.npkTrack}>
              <span
                className={NPK_BAR_CLASS[npk.level]}
                style={{ width: `${clampPercent((row.value / axisMax) * 100)}%` }}
              />
            </span>
            <span className={styles.npkValue}>{formatMeasured(row.value, 'ppm')}</span>
          </li>
        ))}
      </ul>

      <p className={styles.panelNote}>
        แกนเปรียบเทียบปรับตามค่าสูงสุดของแปลงนี้ (เต็มแถบ ≈ {intFormatter.format(axisMax)} ppm)
        สีแถบยึดระดับที่แบบจำลองสรุปให้เท่านั้น
      </p>

      <p className={styles.irrigationReason}>
        คำแนะนำจากชุดข้อมูล: {npk.advice}
      </p>
    </div>
  );
}

/**
 * กราฟ 24 ชั่วโมง (inline SVG ล้วน ไม่มีไลบรารี):
 * เส้นอุณหภูมิอากาศ + เส้นความชื้นดิน (สองแกน) และแท่งปริมาณฝนรายชั่วโมง
 * ป้ายแกนชั่วโมงแสดงทุก 3 ชั่วโมง และย่อเหลือทุก 6 ชั่วโมงที่จอแคบ (ควบคุมด้วย CSS)
 */
function MicroclimateChart({ hours, farmName }: { hours: MicroclimateHour[]; farmName: string }) {
  const width = 700;
  const height = 330;
  const pad = { left: 46, right: 48, top: 18, bottom: 54 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const rainBand = Math.round(innerHeight * 0.26);
  const plotHeight = innerHeight - rainBand;
  const plotBottom = pad.top + plotHeight;
  const baseline = pad.top + innerHeight;

  const temps = hours.map((hour) => hour.airTempC).filter((value) => Number.isFinite(value));
  const moistures = hours.map((hour) => hour.soilMoisturePercent).filter((value) => Number.isFinite(value));
  const rains = hours.map((hour) => hour.rainfallMm).filter((value) => Number.isFinite(value));

  if (hours.length === 0 || temps.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>ไมโครไคลเมต 24 ชั่วโมง</h3>
        </div>
        <div className={styles.emptyState} role="status">
          <Icon name="chart" size={24} />
          <p className={styles.emptyTitle}>ไม่มีข้อมูลไมโครไคลเมตของแปลงนี้</p>
          <p className={styles.emptyText}>
            แปลง {farmName} ยังไม่มี series รายชั่วโมงในชุดข้อมูลตัวอย่าง จึงไม่วาดกราฟแทนค่าเป็นศูนย์
          </p>
        </div>
      </div>
    );
  }

  const tempLowRaw = Math.min(...temps);
  const tempHighRaw = Math.max(...temps);
  const tempAxisMin = Math.floor(tempLowRaw) - 1;
  const tempAxisMax = Math.max(Math.ceil(tempHighRaw) + 1, tempAxisMin + 2);
  const rainAxisMax = Math.max(5, Math.ceil(Math.max(...rains, 0) / 5) * 5);

  const count = hours.length;
  const x = (index: number) => pad.left + (count === 1 ? innerWidth / 2 : (index * innerWidth) / (count - 1));
  const yTemp = (value: number) =>
    pad.top + plotHeight * (1 - (value - tempAxisMin) / (tempAxisMax - tempAxisMin));
  const yMoisture = (value: number) => pad.top + plotHeight * (1 - clampPercent(value) / 100);

  const seriesPoints = (pick: (hour: MicroclimateHour) => number, scaleY: (value: number) => number): string => {
    const points: string[] = [];
    hours.forEach((hour, index) => {
      const value = pick(hour);
      if (!Number.isFinite(value)) return;
      points.push(`${x(index).toFixed(1)},${scaleY(value).toFixed(1)}`);
    });
    return points.join(' ');
  };

  const tempPoints = seriesPoints((hour) => hour.airTempC, yTemp);
  const moisturePoints = seriesPoints((hour) => hour.soilMoisturePercent, yMoisture);
  const barWidth = Math.max(4, (innerWidth / count) * 0.46);
  const moistureGrid = [0, 25, 50, 75, 100];

  return (
    <div className={styles.chart}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>ไมโครไคลเมต 24 ชั่วโมง</h3>
        <span className={styles.panelMeta}>{farmName}</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label={
          `กราฟไมโครไคลเมต 24 ชั่วโมงของ ${farmName}: อุณหภูมิอากาศ ${shortDecimalFormatter.format(tempLowRaw)} ถึง ` +
          `${shortDecimalFormatter.format(tempHighRaw)} องศาเซลเซียส ความชื้นดินเป็นเปอร์เซ็นต์ และแท่งปริมาณฝนหน่วยมิลลิเมตร`
        }
      >
        {/* เส้นตาราง + แกนซ้าย (°C) และแกนขวา (%) */}
        {moistureGrid.map((percent) => {
          const yValue = pad.top + plotHeight * (1 - percent / 100);
          const isMinor = percent === 25 || percent === 75;
          return (
            <g key={`grid-${percent}`}>
              <line x1={pad.left} x2={width - pad.right} y1={yValue} y2={yValue} className={styles.gridLine} />
              <text
                x={pad.left - 8}
                y={(yValue + 3.5).toFixed(1)}
                textAnchor="end"
                className={isMinor ? `${styles.axisLabel} ${styles.minorLabel}` : styles.axisLabel}
              >
                {shortDecimalFormatter.format(tempAxisMin + ((tempAxisMax - tempAxisMin) * percent) / 100)}
              </text>
              <text
                x={width - pad.right + 8}
                y={(yValue + 3.5).toFixed(1)}
                textAnchor="start"
                className={isMinor ? `${styles.axisLabel} ${styles.minorLabel}` : styles.axisLabel}
              >
                {intFormatter.format(percent)}
              </text>
            </g>
          );
        })}

        <text x={pad.left - 8} y={pad.top - 6} textAnchor="end" className={styles.axisUnit}>
          °C
        </text>
        <text x={width - pad.right + 8} y={pad.top - 6} textAnchor="start" className={styles.axisUnit}>
          %
        </text>

        {/* แถบฝนรายชั่วโมงในแถบล่าง */}
        <line x1={pad.left} x2={width - pad.right} y1={plotBottom} y2={plotBottom} className={styles.axisLine} />
        {hours.map((hour, index) => {
          if (!Number.isFinite(hour.rainfallMm) || hour.rainfallMm <= 0) return null;
          const barHeight = Math.min(rainBand, (hour.rainfallMm / rainAxisMax) * rainBand);
          return (
            <rect
              key={`rain-${hour.time}`}
              x={(x(index) - barWidth / 2).toFixed(1)}
              y={(baseline - barHeight).toFixed(1)}
              width={barWidth.toFixed(1)}
              height={barHeight.toFixed(1)}
              rx="1.5"
              className={styles.rainBar}
            >
              <title>{`${hour.hourLabel}: ฝน ${shortDecimalFormatter.format(hour.rainfallMm)} มม.`}</title>
            </rect>
          );
        })}
        <text x={pad.left - 8} y={baseline + 4} textAnchor="end" className={styles.axisUnit}>
          {intFormatter.format(rainAxisMax)} มม.
        </text>

        {/* เส้นข้อมูลสอง series */}
        {moisturePoints ? <polyline points={moisturePoints} className={styles.moistureLine} /> : null}
        {tempPoints ? <polyline points={tempPoints} className={styles.tempLine} /> : null}
        {hours.map((hour, index) => {
          if (index % 6 !== 0 || !Number.isFinite(hour.airTempC)) return null;
          return (
            <circle
              key={`temp-${hour.time}`}
              cx={x(index).toFixed(1)}
              cy={yTemp(hour.airTempC).toFixed(1)}
              r="3"
              className={styles.tempDot}
            />
          );
        })}

        {/* แกนชั่วโมง: ป้ายทุก 3 ชั่วโมง (ย่อเหลือทุก 6 ชั่วโมงบนจอแคบ) */}
        {hours.map((hour, index) => {
          if (index % 3 !== 0) return null;
          const minor = index % 6 !== 0;
          return (
            <text
              key={`tick-${hour.time}`}
              x={x(index).toFixed(1)}
              y={baseline + 20}
              textAnchor="middle"
              className={minor ? `${styles.hourLabel} ${styles.minorLabel}` : styles.hourLabel}
            >
              {hour.hourLabel}
            </text>
          );
        })}
        <text x={width - pad.right} y={baseline + 40} textAnchor="end" className={styles.axisUnit}>
          น. (เวลาไทย)
        </text>
      </svg>

      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={styles.legendSwatch} /> อุณหภูมิอากาศ (°C) สูงสุด{' '}
          {shortDecimalFormatter.format(tempHighRaw)} ต่ำสุด {shortDecimalFormatter.format(tempLowRaw)}
        </li>
        <li className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.legendSwatchMoisture}`} /> ความชื้นดิน (แกน 0–100%
          {moistures.length > 0
            ? ` · วัดได้จริงในช่วงนี้ ${shortDecimalFormatter.format(Math.min(...moistures))}–${shortDecimalFormatter.format(Math.max(...moistures))}%`
            : ` · ${NO_DATA}`}
        </li>
        <li className={styles.legendItem}>
          <span className={styles.legendSwatchRain} /> ฝนรายชั่วโมง (สูงสุด {shortDecimalFormatter.format(rainAxisMax)}{' '}
          มม. บนแถบนี้)
        </li>
      </ul>
    </div>
  );
}

function MicroclimateStats({ farm }: { farm: FarmPlot }) {
  const hours = farm.microclimate;
  const finite = (pick: (hour: MicroclimateHour) => number): number[] =>
    hours.map(pick).filter((value) => Number.isFinite(value));

  const et0Sum = finite((hour) => hour.et0Mm).reduce((sum, value) => sum + value, 0);
  const rainSum = finite((hour) => hour.rainfallMm).reduce((sum, value) => sum + value, 0);
  const lightPeak = finite((hour) => hour.lightKlux);
  const humidity = finite((hour) => hour.humidityPercent);
  const wind = finite((hour) => hour.windSpeedMs);

  const items = [
    { key: 'et0', label: 'ET0 สะสม 24 ชม.', value: hours.length === 0 ? NO_DATA : `${shortDecimalFormatter.format(et0Sum)} มม.` },
    { key: 'rain', label: 'ฝนรวม 24 ชม.', value: hours.length === 0 ? NO_DATA : `${shortDecimalFormatter.format(rainSum)} มม.` },
    {
      key: 'light',
      label: 'แสงสูงสุด',
      value: lightPeak.length === 0 ? NO_DATA : `${intFormatter.format(Math.max(...lightPeak))} ลักซ์`,
    },
    {
      key: 'humidity',
      label: 'ความชื้นสัมพัทธ์เฉลี่ย',
      value: humidity.length === 0 ? NO_DATA : `${shortDecimalFormatter.format(average(humidity) ?? 0)} %`,
    },
    {
      key: 'wind',
      label: 'ลมเฉลี่ย / สูงสุด',
      value:
        wind.length === 0
          ? NO_DATA
          : `${shortDecimalFormatter.format(average(wind) ?? 0)} / ${shortDecimalFormatter.format(Math.max(...wind))} ม./วินาที`,
    },
    { key: 'et0today', label: 'ET0 วันนี้ (แบบจำลอง)', value: `${formatDecimal(farm.et0TodayMm)} มม.` },
  ];

  return (
    <div className={styles.miniStats}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>สถิติรายวันของแปลง</h3>
      </div>
      {items.map((item) => (
        <div key={item.key} className={styles.stat}>
          <span className={styles.statLabel}>{item.label}</span>
          <span className={styles.statValue}>{item.value}</span>
        </div>
      ))}
      <p className={styles.panelNote}>
        ค่ารวม/ค่าสูงสุดคำนวณจาก series รายชั่วโมง 24 ค่าที่มากับแปลงนี้ ไม่ใช่ข้อมูลจากสถานีตรวจอากาศจริง
      </p>
    </div>
  );
}

const DASH = '—';

function thresholdText(value: number | null): string {
  return value === null || !Number.isFinite(value) ? DASH : shortDecimalFormatter.format(value);
}

/** ค่า null ของเซนเซอร์ = ไม่ได้วัด แสดงเป็น "ไม่มีข้อมูล" พร้อมหน่วยที่ต้นทางระบุเท่านั้น */
function formatSensorValue(sensor: SensorNode): string {
  if (sensor.value === null || !Number.isFinite(sensor.value)) return NO_DATA;
  return `${shortDecimalFormatter.format(sensor.value)} ${sensor.unit}`.trim();
}

function SensorTable({ farm, referenceMs }: { farm: FarmPlot; referenceMs: number | null }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>รายการเซนเซอร์ในแปลง</h3>
        <span className={styles.panelMeta}>
          {formatCount(farm.sensors.length)} อุปกรณ์ · ออนไลน์ {formatCount(farm.sensorOnline)} · ขาดการเชื่อมต่อ{' '}
          {formatCount(farm.sensorOffline)} · แบตเตอรี่ต่ำ {formatCount(farm.lowBatteryCount)}
        </span>
      </div>

      {farm.sensors.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <Icon name="info" size={24} />
          <p className={styles.emptyTitle}>แปลงนี้ยังไม่มีรายการเซนเซอร์ในชุดข้อมูลตัวอย่าง</p>
          <p className={styles.emptyText}>
            เมื่อต้นทางส่งรายการอุปกรณ์เข้ามา ตารางจะแสดงค่าที่วัดได้ เกณฑ์และแบตเตอรี่ของแต่ละตัว
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.panelNote}>
                ค่าที่แสดงคือรอบอ่านล่าสุดตามเวลาของรายงาน ไม่ใช่ค่าสดจากเกตเวย์ LoRaWAN
              </caption>
              <thead className={styles.tableHead}>
                <tr>
                  <th scope="col">อุปกรณ์ / ชนิดการวัด</th>
                  <th scope="col">สถานะ</th>
                  <th scope="col">ค่าที่วัดได้</th>
                  <th scope="col">เกณฑ์ต่ำ / สูง</th>
                  <th scope="col">แบตเตอรี่</th>
                  <th scope="col">รายงานล่าสุด</th>
                  <th scope="col">เวอร์ชันเฟิร์มแวร์</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {farm.sensors.map((sensor) => (
                  <tr key={`${farm.farmId}:${sensor.nodeId}`} className={styles.tableRow}>
                    <td data-label="อุปกรณ์">
                      <span className={styles.sensorName}>{sensor.label}</span>
                      <span className={styles.sensorKind}>
                        {SENSOR_KIND_LABEL[sensor.kind]} · {sensor.nodeId}
                      </span>
                    </td>
                    <td data-label="สถานะ">
                      <span className={`${styles.statusPill} ${SENSOR_STATUS_PILL[sensor.status]}`}>
                        {SENSOR_STATUS_LABEL[sensor.status]}
                      </span>
                    </td>
                    <td data-label="ค่าที่วัดได้" className={styles.numericCell}>
                      {sensor.value === null ? (
                        <span className={styles.valueNull}>{NO_DATA}</span>
                      ) : (
                        formatSensorValue(sensor)
                      )}
                    </td>
                    <td data-label="เกณฑ์ต่ำ / สูง" className={styles.numericCell}>
                      {thresholdText(sensor.lowThreshold)} / {thresholdText(sensor.highThreshold)}
                    </td>
                    <td data-label="แบตเตอรี่" className={styles.numericCell}>
                      <span
                        className={sensor.batteryPercent <= LOW_BATTERY_PERCENT ? styles.batteryLabelLow : undefined}
                      >
                        {formatCount(Math.round(sensor.batteryPercent))}%
                      </span>
                    </td>
                    <td data-label="รายงานล่าสุด">
                      {formatRelative(sensor.lastSeenAt, referenceMs)}
                      <span className={styles.sensorKind}>{formatStamp(sensor.lastSeenAt)}</span>
                    </td>
                    <td data-label="เวอร์ชันไมโครคอนโทรลเลอร์">
                      <span className={styles.firmware}>{sensor.firmware}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.scrollHint}>
            <Icon name="arrow" size={13} />
            เลื่อนตารางในแนวนอนเพื่อดูคอลัมน์ที่เหลือ (บนหน้าจอแคบแต่ละอุปกรณ์จะแสดงเป็นแถวซ้อน)
          </p>
        </>
      )}
    </div>
  );
}

function SourceSection({ payload }: { payload: SmartFarmingDashboardPayload }) {
  return (
    <section className={styles.section} aria-label="ที่มาของข้อมูลและช่องว่างที่ยังตรวจสอบไม่เสร็จ">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Provenance</span>
          <h2 className={styles.sectionTitle}>ที่มาข้อมูลและช่องว่างที่ยังเปิดค้าง</h2>
        </div>
        <span className={styles.sectionMeta}>
          สิทธิ์การเผยแพร่ {payload.sources.length} แหล่งยังอยู่ในสถานะ metadata_only
        </span>
      </header>

      <div className={styles.sourceGrid}>
        {payload.sources.map((source) => (
          <div key={source.id} className={styles.sourceCard}>
            <div className={styles.sourceTop}>
              <span className={styles.sourceName}>{source.name}</span>
              <span className={styles.metaOnlyBadge}>
                <Icon name="lock" size={12} /> {source.access}
              </span>
            </div>
            <span className={styles.sourceId}>รหัสอ้างอิง {source.id}</span>
            <p className={styles.sourceNote}>{source.note}</p>
            {source.url === null ? (
              <span className={styles.valueNull}>ต้นทางยังไม่ระบุ URL สำหรับอ้างอิง</span>
            ) : (
              <a className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer">
                <Icon name="external" size={13} /> เปิดแหล่งต้นทาง
              </a>
            )}
          </div>
        ))}
      </div>

      {payload.gaps.length > 0 ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>ช่องว่างที่ต้องปิดก่อนเผยแพร่จริง</h3>
            <span className={styles.panelMeta}>{formatCount(payload.gaps.length)} รายการ</span>
          </div>
          <ul className={styles.gapList}>
            {payload.gaps.map((gap) => (
              <li key={gap.title} className={styles.gapItem}>
                <p className={styles.gapTitle}>{gap.title}</p>
                <p className={styles.gapDetail}>{gap.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={styles.generatedAt}>
        <Icon name="info" size={14} />
        <span>
          รอบสร้างข้อมูล {formatStamp(payload.generatedAt)} · {payload.summary.subheadline}
        </span>
      </p>
    </section>
  );
}







