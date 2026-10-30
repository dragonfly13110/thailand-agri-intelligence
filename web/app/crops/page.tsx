import { Shell } from '@/components/shell';
import { CropsDashboard } from '@/components/crops-dashboard';
import { CropsDoaeProduction } from '@/components/crops-doae-production';
import {
  CROP_TABS,
  CROPS_SOURCE_NOTE,
  CROPS_STATS_SOURCE_URL,
  DOAE_PRODUCTION_README_NOTE,
} from '@/lib/hub/crops-soil-data';
import { loadDoaeProductionBlock } from '@/lib/hub/doae-production-data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'พืชผลเกษตร: ปฏิทินและสายพันธุ์ + ภาวะการผลิตพืชจริงระดับตำบล (DOAE)',
  description:
    'ปฏิทินเพาะปลูกและสายพันธุ์เด่นของพืชเศรษฐกิจ พร้อมแหล่งอ้างอิงรายรายการ ' +
    'และบล็อตภาวะการผลิตพืชอายุสั้นระดับตำบลที่อ่านจากคลังข้อมูลกลางของกรมส่งเสริมการเกษตร ' +
    'เมื่อมีการเผยแพร่ตัวเลขจริง (ไม่ใช้ค่าตัวอย่างแทน)',
};

export default async function CropsPage() {
  // บล็อกนี้อ่านแถวจริงที่เผยแพร่แล้วในคลังกลางเท่านั้น; ไม่มีแถว → สถานะว่าง/ไม่พร้อมอย่างซื่อตรง
  const doaeBlock = await loadDoaeProductionBlock({
    resourceKey: 'doae_production_subdistrict_2023',
  });

  return (
    <Shell active="crops">
      <div className="page-heading">
        <div>
          <h1>พืชผลเกษตร: ปฏิทินและสายพันธุ์</h1>
          <p>
            ปฏิทินการเพาะปลูกและสายพันธุ์เด่นของพืชเศรษฐกิจ พร้อมลิงก์แหล่งอ้างอิงรายรายการ
            สถิติพื้นที่เพาะปลูกและผลผลิตระดับประเทศ (สศก.) ยังถูกระงับระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ
            แต่บล็อตด้านล่างคือภาวะการผลิตพืชอายุสั้นระดับตำบลของกรมส่งเสริมการเกษตรที่อนุมัติให้เผยแพร่แล้ว
            ซึ่งอ่านจากคลังข้อมูลกลางจริงเท่านั้น
          </p>
        </div>
      </div>
      <CropsDashboard
        tabs={CROP_TABS}
        sourceNote={CROPS_SOURCE_NOTE}
        statsSourceUrl={CROPS_STATS_SOURCE_URL}
      />
      <CropsDoaeProduction block={doaeBlock} variant="crops" />
      <p className="area-note">{DOAE_PRODUCTION_README_NOTE}</p>
    </Shell>
  );
}
