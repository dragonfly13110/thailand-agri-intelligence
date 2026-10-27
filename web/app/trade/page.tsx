import { Shell } from '@/components/shell';
import { TradeDashboard } from '@/components/trade-dashboard';
import { buildTradeDashboard } from '@/lib/hub/trade-data';

export const metadata = {
  title: 'สถิติการค้าสินค้าเกษตร นำเข้า-ส่งออก',
  description: 'ข้อมูลสถิติการค้าจะแสดงเมื่อมีระเบียนจริงที่ได้รับอนุมัติให้เผยแพร่',
};

export default async function TradePage() {
  const payload = buildTradeDashboard();

  return (
    <Shell active="trade">
      <div className="page-heading">
        <div>
          <h1>สถิติการค้าสินค้าเกษตร นำเข้า-ส่งออก</h1>
          <p>
            ข้อมูลนำเข้า-ส่งออกจะแสดงเมื่อมีชุดข้อมูลจากแหล่งทางการ พร้อมหน่วย ช่วงเวลา และสิทธิ์เผยแพร่ที่ตรวจสอบได้
          </p>
        </div>
      </div>
      <TradeDashboard initialPayload={payload} />
    </Shell>
  );
}
