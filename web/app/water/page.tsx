import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { WaterDashboard } from '@/components/water-dashboard';
import { WATER_SOURCE_METADATA } from '@/lib/hub/water-data';
import { readWaterSnapshot } from '@/lib/hub/water-repository';

export const metadata: Metadata = {
  title: 'สถานการณ์น้ำอ่างเก็บน้ำขนาดกลาง (ข้อมูลจริง) | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'ปริมาณน้ำและสัดส่วนน้ำรายอ่างเก็บน้ำขนาดกลางจากกรมชลประทาน อ่านจากชุดตัวเลขที่เผยแพร่ได้ในคลังข้อมูลกลาง พร้อมที่มา ความละเอียด และข้อจำกัดของแหล่งข้อมูล',
};

// ตัวเลขเปลี่ยนตามรอบ sync ของคลังข้อมูลกลาง จึงห้ามเก็บหน้านี้ไว้ใน shared cache
export const dynamic = 'force-dynamic';

export default async function WaterPage() {
  // เมื่ออ่านคลังข้อมูลกลางไม่ได้ ให้กลับสู่สัญญา metadata-only
  // ห้ามแปลว่า "ไม่มีน้ำ" จากการที่ฐานข้อมูลเชื่อมต่อไม่ได้
  const snapshot = await readWaterSnapshot().catch(() => null);

  return (
    <Shell active="water">
      <WaterDashboard
        metadata={WATER_SOURCE_METADATA}
        payload={snapshot?.payload ?? null}
        provenance={snapshot?.provenance ?? null}
      />
    </Shell>
  );
}
