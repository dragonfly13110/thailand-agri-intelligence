import { Shell } from '@/components/shell';
import { FinanceDashboard } from '@/components/finance-dashboard';
import { buildFinanceDashboard } from '@/lib/hub/finance-data';

export const metadata = {
  title: 'การเงินเกษตรกรและประกันภัยพืชผล (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างจำลองโครงการประกันภัยพืชผล เบี้ยประกันและความคุ้มครอง ค่าสินไหมตามภัยธรรมชาติ และดัชนีสินเชื่อเกษตรกร ภายใต้สถานะ metadata-only ระหว่างรอตรวจสอบสิทธิ์',
};

export default async function FinancePage() {
  const payload = await buildFinanceDashboard();

  return (
    <Shell active="finance">
      <div className="page-heading">
        <div>
          <h1>การเงินเกษตรกรและประกันภัยพืชผล</h1>
          <p>
            ภาพรวมโครงการประกันภัยข้าวนาปีและข้าวโพดเลี้ยงสัตว์ เบี้ยประกันและความคุ้มครองสองชั้น
            สัดส่วนค่าสินไหมตามประเภทภัยธรรมชาติ ดัชนีภาระหนี้และการเข้าถึงแหล่งทุนของ ธ.ก.ส.
            และกองทุนหมุนเวียนเพื่อการกู้ยืมแก่เกษตรกร พร้อมแบบจำลอง Claim Ratio รายภูมิภาค
          </p>
        </div>
      </div>

      <FinanceDashboard payload={payload} />

      <details className="area-note">
        <summary>อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล</summary>
        <p>
          หมายเหตุการกำกับดูแลข้อมูล: ตัวเลขเบี้ยประกัน ความคุ้มครอง พื้นที่เพาะปลูก ค่าสินไหม
          ยอดสินเชื่อ และดัชนีทางการเงินในหน้านี้เป็นข้อมูลจำลองเชิงโครงสร้าง (Deterministic Sample)
          ที่อ้างอิงกรอบนโยบายและสถิติสาธารณะเพื่อการสาธิตเท่านั้น ไม่ใช่ข้อมูลรายบัญชีหรือสถิติราชการ
          สิทธิ์การเผยแพร่ข้อมูลรายแปลงและรายผู้กู้จากหน่วยงานต้นทางยังอยู่ระหว่างการตรวจสอบ
          จึงแสดงเฉพาะโครงสร้างและค่าจำลองภายใต้สถานะ Metadata Only
        </p>
      </details>
    </Shell>
  );
}
