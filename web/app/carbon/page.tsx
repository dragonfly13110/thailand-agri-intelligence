import { Shell } from '@/components/shell';
import { CarbonDashboard } from '@/components/carbon-dashboard';
import { buildCarbonDashboard } from '@/lib/hub/carbon-data';

export const metadata = {
  title: 'คาร์บอนเครดิตภาคเกษตรและเกษตรคาร์บอนต่ำ (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองศักยภาพการกักเก็บคาร์บอนในภาคเกษตรรายจังหวัด โครงการ T-VER ภาคเกษตรและป่าไม้ และนาเปียกสลับแห้ง (AWD) ภายใต้สถานะ metadata-only ระหว่างรอตรวจสอบสิทธิ์',
};

export default function CarbonPage() {
  const payload = buildCarbonDashboard();

  return (
    <Shell active="carbon">
      <div className="page-heading">
        <div>
          <h1>คาร์บอนเครดิตภาคเกษตรและเกษตรคาร์บอนต่ำ</h1>
          <p>
            ติดตามศักยภาพการกักเก็บคาร์บอนของไม้ยืนต้น ยางพารา ปาล์มน้ำมัน และดินเกษตรรายจังหวัด
            ควบคู่กับสถิติโครงการ T-VER ภาคเกษตรและป่าไม้ และศักยภาพการลดก๊าซมีเทนจากการทำนาเปียกสลับแห้ง (AWD)
          </p>
        </div>
      </div>

      <CarbonDashboard payload={payload} />

      <details className="area-note">
        <summary>อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล</summary>
        <p>
          หมายเหตุการกำกับดูแลข้อมูล: ตัวเลขคาร์บอนเครดิต โครงการ T-VER และการวิเคราะห์ AWD ในหน้านี้เป็นข้อมูลตัวอย่างเชิงโครงสร้าง
          (Deterministic Sample Data) เพื่อสาธิตระบบ ยังไม่ใช่สถิติทางการหรือผลประเมินที่ผ่านการทวนสอบ
          สิทธิ์การเผยแพร่ตัวเลขรายแปลงและรายโครงการจาก อบก. กรมพัฒนาที่ดิน กรมส่งเสริมการเกษตร และ สศก.
          อยู่ระหว่างการตรวจสอบตามมาตรฐานการเปิดเผยข้อมูล (Metadata Only)
        </p>
      </details>
    </Shell>
  );
}
