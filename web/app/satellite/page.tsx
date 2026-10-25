import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { SatelliteDashboard } from '@/components/satellite-dashboard';
import {
  SATELLITE_GOVERNANCE,
  SATELLITE_WARNINGS,
  NDVI_SCALE,
  getSatelliteSummary,
  getSatelliteSources,
  getProvinceSatelliteRisks,
  getBasinFloodStats,
  getSatelliteScenes,
} from '@/lib/hub/satellite-data';

export const metadata: Metadata = {
  // root layout มี template '%s | ศูนย์ข้อมูลเกษตรไทย' — ไม่ต้องใส่ suffix ซ้ำใน title
  title: 'ศูนย์ข้อมูลดาวเทียมเกษตร (น้ำท่วม ภัยแล้ง NDVI)',
  description:
    'ข้อมูลสาธิตจากดาวเทียม/สารสนเทศภูมิศาสตร์ (Earth Observation) สำหรับติดตามน้ำท่วม ภัยแล้ง และความเขียวขจีของพืชพรรณรายจังหวัด ' +
    'ภายใต้สถานะ metadata-only — แหล่งข้อมูล GISTDA, Sentinel และ MODIS ยังรอตรวจสิทธิ์เผยแพร่ (license pending) ห้ามอ้างอิงเป็นสถิติทางการ',
};

// Simulation payloads must not be frozen into a shared/public HTML cache.
// (payload จำลองต้องไม่ถูกแช่แข็งในแคช HTML สาธารณะ — เช่นเดียวกับหน้า early-warning)
export const dynamic = 'force-dynamic';

export default function SatellitePage() {
  // ตัวสร้าง payload เป็น synchronous ตามสัญญา lane 2A — ไม่ต้อง await และไม่ต้อง fetch API route จากหน้า
  const summary = getSatelliteSummary();
  const sources = getSatelliteSources();
  const provinces = getProvinceSatelliteRisks();
  const basins = getBasinFloodStats();
  const scenes = getSatelliteScenes();

  return (
    <Shell active="satellite">
      <SatelliteDashboard
        initialSummary={summary}
        initialSources={sources}
        initialProvinces={provinces}
        initialBasins={basins}
        initialScenes={scenes}
        initialGovernance={SATELLITE_GOVERNANCE}
        initialWarnings={SATELLITE_WARNINGS}
        initialNdviScale={NDVI_SCALE}
      />
    </Shell>
  );
}
