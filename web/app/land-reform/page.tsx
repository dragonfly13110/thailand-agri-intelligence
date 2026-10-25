import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { LandReformDashboard } from '@/components/land-reform-dashboard';
import { buildLandReformData } from '@/lib/hub/land-reform-data';

export const metadata: Metadata = {
  title: 'เขตปฏิรูปที่ดิน ส.ป.ก. และกรรมสิทธิ์ที่ดินเกษตรกรรม',
  description:
    'แดชบอร์ดตัวอย่างเชิงโครงสร้าง (deterministic structural sample) เพื่อสาธิตข้อมูลเขตปฏิรูปที่ดิน เอกสารสิทธิ์ และความมั่นคงในการถือครองที่ดินเกษตรกรรม สิทธิ์ข้อมูลของ ส.ป.ก. (ALRO) อยู่ระหว่างตรวจสอบ ยังไม่ใช่สถิติทางการ',
};

// Simulation payloads must not be frozen into a shared/public HTML cache.
export const dynamic = 'force-dynamic';

export default function LandReformPage() {
  const data = buildLandReformData();

  return (
    <Shell active="land-reform">
      <LandReformDashboard initialData={data} />
    </Shell>
  );
}
