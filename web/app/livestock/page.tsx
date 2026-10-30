import { Shell } from '@/components/shell';
import { DldBeefCattleDashboard } from '@/components/dld-beef-cattle-dashboard';
import { LivestockDashboard } from '@/components/livestock-dashboard';
import { loadDldBeefCattleEnvelope } from '@/lib/hub/dld-beef-cattle';
import { buildLivestockDashboard } from '@/lib/hub/livestock-data';
import type { DldBeefCattleEnvelope } from '@/lib/hub/dld-beef-cattle';
import type { LivestockDashboardPayload } from '@/lib/hub/livestock-data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ | Thailand Agricultural Data Hub',
  description:
    'ตัวเลขปศุสัตว์รายจังหวัดจากคลังข้อมูลกลางของทรัพยากรกรมปศุสัตว์ที่อนุมัติสิทธิ์ พร้อมรายละเอียดโคเนื้อตามป้ายปี พ.ศ. ต้นทาง และข้อจำกัดของชุดสัตว์น้ำ',
};

export default async function LivestockPage() {
  let dashboard: LivestockDashboardPayload | null = null;
  try {
    dashboard = await buildLivestockDashboard();
  } catch {
    // Never fall back to sample numbers: the honest failure state is an
    // explicit "store unreadable" card rendered below.
  }

  let cattle: DldBeefCattleEnvelope | null = null;
  try {
    cattle = await loadDldBeefCattleEnvelope();
  } catch {
    // DldBeefCattleDashboard presents its own unavailable state.
  }

  return (
    <Shell active="livestock">
      <div className="page-heading">
        <div>
          <h1>สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ</h1>
          <p>
            ตัวเลขรายจังหวัดของกรมปศุสัตว์อ่านจากคลังข้อมูลกลางตามทรัพยากรที่ทะเบียนสิทธิ์อนุมัติ
            แสดงตามป้ายปี พ.ศ. ต้นทาง โดยยังไม่ยืนยันว่าปีนั้นเป็นปีปฏิทินหรือปีงบประมาณ
            ส่วนตัวเลขสัตว์น้ำของกรมประมงยังเป็นค่าตัวอย่างเพราะสิทธิ์อยู่ระหว่างตรวจ
          </p>
        </div>
      </div>
      {dashboard ? (
        <LivestockDashboard payload={dashboard} />
      ) : (
        <section className="card" aria-label="สถานะข้อมูลปศุสัตว์">
          <h2>อ่านคลังข้อมูลกลางไม่สำเร็จ</h2>
          <p>
            ขณะนี้ระบบอ่านคลังข้อมูลกลางเพื่อแสดงสถิติปศุสัตว์และสัตว์น้ำไม่สำเร็จ
            จึงไม่แสดงตัวเลขใด ๆ ชั่วคราว (ไม่ใช้ค่าตัวอย่างแทน) กรุณาลองใหม่ภายหลัง
          </p>
        </section>
      )}

      <div className="page-heading" style={{ marginTop: 32 }}>
        <div>
          <h2>รายละเอียดโคเนื้อรายจังหวัด (ชุดอนุมัติแล้ว)</h2>
          <p>
            ข้อมูลจริงจากกรมปศุสัตว์ตามป้ายปี พ.ศ. ต้นทาง พร้อมที่มาของ run และข้อจำกัดของช่วงเวลา
          </p>
        </div>
      </div>
      <DldBeefCattleDashboard payload={cattle} />
    </Shell>
  );
}
