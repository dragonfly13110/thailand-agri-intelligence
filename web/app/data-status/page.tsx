import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { DataStatusDashboard } from '@/components/data-status-dashboard';

export const metadata: Metadata = {
  title: 'สถานะแหล่งข้อมูล',
  description:
    'เวลาอ่านและรอบงาน sync ล่าสุดของแต่ละแหล่งข้อมูล แยกสถานะทะเบียนออกจากสถานะรอบงาน และบอกเมื่อยังไม่ทราบสถานะ',
};

export const dynamic = 'force-dynamic';

export default function DataStatusPage() {
  return (
    <Shell active="open-data">
      <DataStatusDashboard />
    </Shell>
  );
}
