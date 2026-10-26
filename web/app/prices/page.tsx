import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { PriceDashboard } from '@/components/price-dashboard';
import { PRICE_COMMODITIES } from '@/lib/hub/price-data';
import { readPriceSnapshot } from '@/lib/hub/price-repository';

export const metadata: Metadata = {
  title: 'ราคาสินค้าเกษตรรายวันจาก OAE/NABC | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'ราคาข้าว มันสำปะหลัง ข้าวโพด ยางพารา และปาล์มน้ำมันรายวันตามประกาศต้นทาง OAE/NABC แยกตามสินค้า/เกรด ตลาด จังหวัด วัน และหน่วย',
};

// The snapshot is read live from the upstream API on every request.
export const dynamic = 'force-dynamic';

export default async function PricesPage() {
  const snapshot = await readPriceSnapshot();

  return (
    <Shell active="prices">
      <PriceDashboard commodities={PRICE_COMMODITIES} snapshot={snapshot} />
    </Shell>
  );
}
