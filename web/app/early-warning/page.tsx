import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { EarlyWarningDashboard } from '@/components/early-warning-dashboard';
import {
  getEarlyWarningSummary,
  getProvinceRisks,
  get14DaySimulationForecast,
  getCriticalReservoirs,
} from '@/lib/hub/early-warning-data';

export const metadata: Metadata = {
  title: 'แบบจำลองเตือนภัยน้ำท่วมและภัยแล้งเพื่อการเกษตร | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'แบบจำลองสังเคราะห์เพื่อสาธิตระบบเตือนภัยน้ำท่วมและภัยแล้งล่วงหน้า 14 วัน พร้อมดัชนีความเสี่ยงรายลุ่มน้ำและจังหวัด — ไม่ได้ใช้ค่าจริงจากรายงานอ่างเก็บน้ำที่ยังรอตรวจสิทธิ์',
};

// Simulation payloads must not be frozen into a shared/public HTML cache.
export const dynamic = 'force-dynamic';

export default function EarlyWarningPage() {
  const summary = getEarlyWarningSummary();
  const provinces = getProvinceRisks();
  const forecast = get14DaySimulationForecast();
  const criticalReservoirs = getCriticalReservoirs();

  return (
    <Shell active="early-warning">
      <EarlyWarningDashboard
        initialSummary={summary}
        initialProvinces={provinces}
        initialForecast={forecast}
        initialCriticalReservoirs={criticalReservoirs}
      />
    </Shell>
  );
}
