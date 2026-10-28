import { Shell } from '@/components/shell';
import { DldBeefCattleDashboard } from '@/components/dld-beef-cattle-dashboard';
import { loadDldBeefCattleEnvelope } from '@/lib/hub/dld-beef-cattle';
import type { DldBeefCattleEnvelope } from '@/lib/hub/dld-beef-cattle';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'จำนวนโคเนื้อรายจังหวัด | Thailand Agricultural Data Hub',
  description: 'ข้อมูลโคเนื้อรายจังหวัดจากกรมปศุสัตว์ตามป้ายปี พ.ศ. ต้นทาง พร้อมแสดงที่มาและข้อจำกัดของช่วงเวลา',
};

export default async function LivestockPage() {
  let payload: DldBeefCattleEnvelope | null = null;
  try {
    payload = await loadDldBeefCattleEnvelope();
  } catch {
    // The dashboard presents an explicit unavailable state; it never falls
    // back to the sample payload used by the legacy livestock endpoint.
  }

  return (
    <Shell active="livestock">
      <div className="page-heading">
        <div>
          <h1>จำนวนโคเนื้อรายจังหวัด</h1>
          <p>
            ข้อมูลจากกรมปศุสัตว์ แสดงตามป้ายปี พ.ศ. ต้นทาง โดยยังไม่ยืนยันว่าปีนั้นเป็นปีปฏิทินหรือปีงบประมาณ
          </p>
        </div>
      </div>
      <DldBeefCattleDashboard payload={payload} />
    </Shell>
  );
}
