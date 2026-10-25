import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { MachineryDashboard } from '@/components/machinery-dashboard';
import { buildMachineryDashboard } from '@/lib/hub/machinery-data';

export const metadata: Metadata = {
  title: 'ศูนย์บริหารเครื่องจักรกลเกษตรและบริการจ้างเหมา (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองเครื่องจักรกลการเกษตร ค่าเช่าเฉลี่ยต่อไร่ ดัชนีแรงม้าต่อพื้นที่ และศูนย์จ้างเหมารายจังหวัด ภายใต้สถานะ metadata-only ระหว่างรอตรวจสอบสิทธิ์',
};

export default function MachineryPage() {
  const payload = buildMachineryDashboard();

  return (
    <Shell active="machinery">
      <MachineryDashboard payload={payload} />
      <p className="area-note">
        หมายเหตุการกำกับดูแลข้อมูล: ตัวเลขเครื่องจักรกล ค่าเช่า และจำนวนศูนย์บริการในหน้านี้เป็นข้อมูลตัวอย่าง
        เชิงโครงสร้าง (Deterministic Sample Data) เพื่อสาธิตการแสดงผล มิใช่สถิติทางการ
        สิทธิ์การเผยแพร่ข้อมูลทะเบียนเครื่องจักรและศูนย์บริการจากกรมส่งเสริมการเกษตร สศก. และสมาคมผู้ประกอบการ
        ยังอยู่ระหว่างการตรวจสอบ จึงแสดงเฉพาะโครงสร้างภายใต้สถานะ Metadata Only
      </p>
    </Shell>
  );
}
