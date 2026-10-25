import { Shell } from '@/components/shell';
import { LogisticsDashboard } from '@/components/logistics-dashboard';
import { buildLogisticsDashboard } from '@/lib/hub/logistics-data';

export const metadata = {
  title: 'โครงสร้างพื้นฐานโลจิสติกส์การเกษตรและคลังสินค้าห้องเย็น (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองโครงสร้างพื้นฐานโลจิสติกส์การเกษตร คลังสินค้าห้องเย็น โรงคัดบรรจุมาตรฐาน GMP ระเบียงขนส่ง และอัตราการสูญเสียหลังการเก็บเกี่ยว ภายใต้สถานะ metadata-only',
};

export default async function LogisticsPage() {
  const payload = await buildLogisticsDashboard();

  return (
    <Shell active="logistics">
      <div className="page-heading">
        <div>
          <h1>โครงสร้างพื้นฐานโลจิสติกส์การเกษตรและคลังสินค้าห้องเย็น</h1>
          <p>
            ระบบติดตามความจุคลังสินค้าห้องเย็น (Cold Storage) โรงคัดบรรจุมาตรฐาน GMP/GHPs
            ศูนย์กระจายสินค้าการเกษตรรายภูมิภาค การประเมินระเบียงขนส่ง (Trade Corridors) สู่ท่าเรือและด่านชายแดน
            พร้อมแบบจำลองอัตราการสูญเสียหลังการเก็บเกี่ยว (Post-Harvest Loss)
          </p>
        </div>
      </div>

      <LogisticsDashboard payload={payload} />

      <p className="area-note">
        หมายเหตุการกำกับดูแลข้อมูล: ข้อมูลความจุคลังสินค้าห้องเย็น จำนวนโรงคัดบรรจุ และตัวเลขสถิติโลจิสติกส์ในหน้านี้
        เป็นข้อมูลตัวอย่างเชิงโครงสร้าง (Deterministic Sample Data) เพื่อการสาธิตระบบ (Demo)
        โดยสิทธิ์การเผยแพร่ข้อมูลทะเบียนดิบรายสถานประกอบการจากหน่วยงานต้นทาง (กรมวิชาการเกษตร กรมการค้าภายใน
        และกรมการขนส่งทางบก) ยังอยู่ระหว่างการตรวจสอบสิทธิ์ตามมาตรฐานการเปิดเผยข้อมูล (Metadata Only)
        จึงยังไม่ควรอ้างอิงเป็นสถิติทางการในทางกฎหมาย
      </p>
    </Shell>
  );
}
