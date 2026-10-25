import { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { PriceDashboard } from '@/components/price-dashboard';
import { PRICE_COMMODITIES } from '@/lib/hub/price-data';

export const metadata: Metadata = {
  title: 'สถานะข้อมูลราคาสินค้าเกษตร (metadata-only) | ศูนย์ข้อมูลเกษตรไทย',
  description:
    'รายการสินค้า หน่วย และตลาดเป้าหมายจาก OAE/NABC ยังไม่เปิดเผยราคาเพราะทะเบียนสิทธิ์ยังเป็น pending',
};

export default function PricesPage() {
  return (
    <Shell active="prices">
      <PriceDashboard commodities={PRICE_COMMODITIES} />
    </Shell>
  );
}
