import { Shell } from '@/components/shell';
import { LivestockDashboard } from '@/components/livestock-dashboard';
import { buildLivestockDashboard } from '@/lib/hub/livestock-data';

export const metadata = {
  title: 'สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองสถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ พร้อมข้อมูลที่มาและแหล่งอ้างอิงรายชุด ภายใต้สถานะ metadata-only ระหว่างรอตรวจสอบสิทธิ์',
};

export default async function LivestockPage() {
  const payload = await buildLivestockDashboard();

  return (
    <Shell active="livestock">
      <div className="page-heading">
        <div>
          <h1>สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ (ข้อมูลตัวอย่าง)</h1>
          <p>
            ตัวอย่างสถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจจากกรมปศุสัตว์และกรมประมง
            พร้อมข้อมูลที่มาและแหล่งอ้างอิงรายชุด ยังไม่ใช่สถิติทางการและอยู่ระหว่างตรวจสอบสิทธิ์
          </p>
        </div>
      </div>
      <LivestockDashboard payload={payload} />
      <p className="area-note">
        ตัวเลขทุกชุดในหน้านี้เป็นข้อมูลตัวอย่าง (demo) สำหรับทดสอบการแสดงผล
        โดยสิทธิ์การเผยแพร่ซ้ำและเกณฑ์ปีอ้างอิงของแหล่งข้อมูลต้นทางยังอยู่ระหว่างการตรวจสอบ
        จึงยังไม่ควรอ้างอิงเป็นสถิติทางการ การจัดกลุ่มภาคยึดตามระบบของหน่วยงานต้นทางแต่ละแห่ง
        (กรมปศุสัตว์และกรมประมงใช้การแบ่งภาคไม่ตรงกัน) จึงไม่ควรนำมารวมกัน
        และข้อมูลนี้เป็นระดับจังหวัด/ภาคจากหน่วยงานต้นทาง ไม่ใช่แถว observation ของคลังข้อมูลกลางของ Hub
      </p>
    </Shell>
  );
}
