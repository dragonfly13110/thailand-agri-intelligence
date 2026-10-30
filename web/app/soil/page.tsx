import { Shell } from '@/components/shell';
import { SoilDashboard } from '@/components/soil-dashboard';
import { SoilDoaeProduction } from '@/components/soil-doae-production';
import { DOAE_PRODUCTION_README_NOTE } from '@/lib/hub/crops-soil-data';
import { loadDoaeProductionBlock } from '@/lib/hub/doae-production-data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ดินและปุ๋ย (ข้อมูลอ้างอิง) + ภาวะการผลิตพืชระดับตำบล (DOAE)',
  description:
    'ค้นกลุ่มชุดดินอ้างอิงจากกรมพัฒนาที่ดิน พร้อมเนื้อดิน ค่า pH ความอุดมสมบูรณ์ และคำแนะนำปุ๋ยตามชนิดดินและพืช ' +
    'และบล็อตภาวะการผลิตพืชอายุยาวระดับตำบลที่อ่านจากคลังข้อมูลกลางของกรมส่งเสริมการเกษตร ' +
    'เพื่อเทียบเคียงพื้นที่ปลูกลูกชั้นกับชุดดินที่เลือก (ไม่ใช่ผลตรวจดิน)',
};

export default async function SoilPage() {
  // บล็อกเทียบเคียง: ใช้ชุดไม้ผลยืนต้น (เกรนตำบล) ที่อนุมัติเผยแพร่ — อ่านจากคลังกลางจริงเท่านั้น
  const doaeBlock = await loadDoaeProductionBlock({
    resourceKey: 'doae_perennial_subdistrict_2023',
  });

  return (
    <Shell active="soil">
      <div className="page-heading">
        <div>
          <h1>ดินและปุ๋ย (ข้อมูลอ้างอิง)</h1>
          <p>
            ค้นกลุ่มชุดดินด้วยชื่อพื้นที่หรือรหัส ดูเนื้อดิน ค่า pH ความอุดมสมบูรณ์ และปัญหาดิน
            พร้อมตารางปุ๋ยแนะนำตามชนิดดินจาก กรมพัฒนาที่ดิน กรมวิชาการเกษตร และกรมส่งเสริมการเกษตร
            โดยแสดงเฉพาะชุดดินตัวอย่างที่ตรวจทานแล้ว ไม่ได้อ้างว่าครอบคลุมทุกกลุ่มชุดดินของประเทศ
          </p>
        </div>
      </div>
      <SoilDashboard />
      <p className="area-note">
        หมายเหตุการกำกับดูแลข้อมูล: รายการชุดดินและคำแนะนำปุ๋ยในหน้านี้เป็นข้อมูลอ้างอิงเชิงตัวอย่าง
        เพื่อสาธิตการค้นหาและการแสดงผล สิทธิ์การเผยแพร่ข้อมูลทะเบียนชุดดินรายพื้นที่จากกรมพัฒนาที่ดิน
        ยังอยู่ระหว่างการตรวจสอบ จึงไม่ควรอ้างอิงเป็นคำแนะนำทางการรายแปลง
      </p>

      <SoilDoaeProduction block={doaeBlock} />
      <p className="area-note">{DOAE_PRODUCTION_README_NOTE}</p>
    </Shell>
  );
}
