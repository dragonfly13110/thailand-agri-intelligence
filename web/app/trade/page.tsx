import { Shell } from '@/components/shell';
import { OaeTradeDashboard } from '@/components/trade-oae-dashboard';
import { loadOaeTradeEnvelope, unavailableOaeTradeEnvelope } from '@/lib/hub/oae-trade-data';
import type { OaeTradeEnvelope } from '@/lib/hub/oae-trade-data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'มูลค่าการส่งออกสินค้าเกษตร | Thailand Agricultural Data Hub',
  description: 'ข้อมูลการส่งออกสินค้าเกษตรจากสำนักงานเศรษฐกิจการเกษตร โดยคงป้ายปีและเกรนตามต้นทาง',
};

export default async function TradePage() {
  let envelope: OaeTradeEnvelope;
  try {
    envelope = await loadOaeTradeEnvelope();
  } catch {
    envelope = unavailableOaeTradeEnvelope();
  }

  return (
    <Shell active="trade">
      <div className="page-heading">
        <div>
          <h1>มูลค่าการส่งออกสินค้าเกษตร</h1>
          <p>
            ข้อมูลจากสำนักงานเศรษฐกิจการเกษตร แสดงตามสินค้าและป้ายปีต้นทาง โดยไม่แปลงปีเป็นช่วงวันที่
          </p>
        </div>
      </div>
      <OaeTradeDashboard envelope={envelope} />
    </Shell>
  );
}
