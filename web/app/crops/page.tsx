import { Shell } from '@/components/shell';
import { CropsDashboard } from '@/components/crops-dashboard';
import { CROP_TABS, CROPS_SOURCE_NOTE, CROPS_STATS_SOURCE_URL } from '@/lib/hub/crops-soil-data';

export const metadata = {
  title: 'พืชผลเกษตร: ปฏิทินและสายพันธุ์ (ไม่รวมสถิติผลผลิต)',
  description:
    'ปฏิทินเพาะปลูกและสายพันธุ์เด่นของพืชเศรษฐกิจ พร้อมแหล่งอ้างอิงรายรายการ โดยระงับการแสดงสถิติพื้นที่และผลผลิตระดับประเทศระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ',
};

export default function CropsPage() {
  return (
    <Shell active="crops">
      <div className="page-heading">
        <div>
          <h1>พืชผลเกษตร: ปฏิทินและสายพันธุ์</h1>
          <p>
            ปฏิทินการเพาะปลูกและสายพันธุ์เด่นของพืชเศรษฐกิจ พร้อมลิงก์แหล่งอ้างอิงรายรายการ
            สถิติพื้นที่เพาะปลูกและผลผลิตระดับประเทศถูกถอดออกชั่วคราวระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ
            จึงยังไม่แสดงตัวเลขผลผลิตในหน้านี้
          </p>
        </div>
      </div>
      <CropsDashboard
        tabs={CROP_TABS}
        sourceNote={CROPS_SOURCE_NOTE}
        statsSourceUrl={CROPS_STATS_SOURCE_URL}
      />
    </Shell>
  );
}
