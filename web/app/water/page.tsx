import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { WaterDashboard } from '@/components/water-dashboard';
import { WATER_SOURCE_METADATA } from '@/lib/hub/water-data';

export const metadata: Metadata = {
  title: 'สถานะข้อมูลอ่างเก็บน้ำ (metadata-only) | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'หน้าสถานะแหล่งข้อมูลอ่างเก็บน้ำขนาดกลางของกรมชลประทาน ยังไม่เปิดเผยปริมาณน้ำ ความจุ เปอร์เซ็นต์ หรือจำนวนอ่าง เพราะทะเบียนสิทธิ์ยังเป็น pending',
};

export default function WaterPage() {
  return (
    <Shell active="water">
      <WaterDashboard metadata={WATER_SOURCE_METADATA} />
    </Shell>
  );
}
