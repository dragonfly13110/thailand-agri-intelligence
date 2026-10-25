import { Shell } from '@/components/shell';
import { TradeDashboard } from '@/components/trade-dashboard';
import { buildTradeDashboard } from '@/lib/hub/trade-data';

export const metadata = {
  title: 'สถิติการค้าสินค้าเกษตร นำเข้า-ส่งออก และห่วงโซ่มูลค่า (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองมูลค่าและปริมาณการนำเข้า-ส่งออกสินค้าเกษตรสำคัญ ดุลการค้า ประเทศคู่ค้าหลัก และโครงสร้างราคาหน้าด่าน ภายใต้สถานะ metadata-only',
};

export default async function TradePage() {
  const payload = buildTradeDashboard();

  return (
    <Shell active="trade">
      <div className="page-heading">
        <div>
          <h1>สถิติการค้าสินค้าเกษตร นำเข้า-ส่งออก และห่วงโซ่มูลค่า (ข้อมูลตัวอย่าง)</h1>
          <p>
            ตัวอย่างภาพรวมการค้าระหว่างประเทศของสินค้าเกษตรยุทธศาสตร์ 5 ชนิด (ข้าว, ยางพารา, มันสำปะหลัง, ปาล์มน้ำมัน, ทุเรียน)
            จำแนกตามพิกัดศุลกากร (HS Code) ดุลการค้า และการวิเคราะห์ห่วงโซ่มูลค่าจากหน้าฟาร์มสู่หน้าด่านส่งออก (FOB)
            ยังไม่ใช่สถิติทางการและอยู่ระหว่างตรวจสอบสิทธิ์
          </p>
        </div>
      </div>
      <TradeDashboard initialPayload={payload} />
      <p className="area-note">
        หมายเหตุการกำกับดูแลข้อมูล: ตัวเลขมูลค่า ปริมาณ และดุลการค้าในหน้านี้เป็นข้อมูลตัวอย่างเชิงโครงสร้าง
        (Deterministic Sample Data) เพื่อสาธิตการแสดงผล มิใช่สถิติทางการ สิทธิ์การเผยแพร่ข้อมูลศุลกากร
        และราคาหน้าด่านจากหน่วยงานต้นทางยังอยู่ระหว่างการตรวจสอบ จึงแสดงเฉพาะโครงสร้างภายใต้สถานะ Metadata Only
      </p>
    </Shell>
  );
}
