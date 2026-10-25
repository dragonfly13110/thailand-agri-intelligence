import { Shell } from '@/components/shell';
import { CropEvidenceDashboard } from '@/components/crop-evidence-dashboard';
import { buildCropEvidence } from '@/lib/hub/crop-evidence-data';

export const metadata = {
  title: 'ตรวจสอบหลักฐานพื้นที่เพาะปลูกและทะเบียนแปลงเกษตร (ข้อมูลตัวอย่าง)',
  description:
    'แดชบอร์ดตัวอย่างเปรียบเทียบพื้นที่เพาะปลูกที่จังหวัดรายงาน พื้นที่ขึ้นทะเบียนเกษตรกร (ทบก.01) และพื้นที่ที่ผ่านการตรวจพิสูจน์ภาคสนาม รายอำเภอและรายพืช ภายใต้สถานะ metadata-only ระหว่างรอตรวจสอบสิทธิ์',
};

export default function CropEvidencePage() {
  const payload = buildCropEvidence();

  return (
    <Shell active="crop-evidence">
      <div className="page-heading">
        <div>
          <h1>ตรวจสอบหลักฐานพื้นที่เพาะปลูกและทะเบียนแปลงเกษตร</h1>
          <p>
            เทียบหลักฐาน 3 ชั้นรายอำเภอและรายพืช ได้แก่ พื้นที่เพาะปลูกที่จังหวัดรายงาน
            พื้นที่ขึ้นทะเบียนเกษตรกรตามแบบ ทบก.01 ของกรมส่งเสริมการเกษตร และพื้นที่ที่ผ่านการตรวจพิสูจน์ภาคสนาม
            เพื่อชี้จุดที่ตัวเลขไม่สอดคล้อง ระดับความเชื่อมั่น และงานตรวจสอบที่ควรทำต่อ
          </p>
        </div>
      </div>

      <CropEvidenceDashboard payload={payload} />

      <p className="area-note">
        หมายเหตุการกำกับดูแลข้อมูล: ตัวเลขพื้นที่ จำนวนแปลง และผลตรวจพิสูจน์ในหน้านี้เป็นข้อมูลตัวอย่างเชิงโครงสร้าง
        (Deterministic Sample Data) เพื่อสาธิตวิธีกระทบยอดหลักฐานเท่านั้น ไม่ใช่สถิติทางการของจังหวัด
        กรมส่งเสริมการเกษตร หรือ สศก. สิทธิ์การเผยแพร่ตัวเลขทะเบียนเกษตรกรและผลตรวจพิสูจน์รายอำเภอยังอยู่ระหว่างการตรวจสอบ
        จึงเปิดเผยในระดับ metadata เท่านั้น (Metadata Only) ห้ามนำไปอ้างอิงเป็นตัวเลขจริง
      </p>
    </Shell>
  );
}
