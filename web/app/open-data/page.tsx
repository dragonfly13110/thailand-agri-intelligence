import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { OpenDataDashboard } from '@/components/open-data-dashboard';
import { getOpenDataAnalytics, type OpenDataAnalytics } from '@/lib/hub/open-data-analytics';

export const metadata: Metadata = {
  title: 'ความพร้อมข้อมูลเปิดภาครัฐ',
  description: 'สัดส่วนรูปแบบไฟล์และความพร้อมข้อมูลเปิดรายหน่วยงาน จาก metadata ในบัญชีข้อมูลกลาง ไม่ใช่การรับรองความโปร่งใส',
};

export const dynamic = 'force-dynamic';

export default async function OpenDataPage() {
  let data: OpenDataAnalytics | null = null;
  try {
    data = await getOpenDataAnalytics();
  } catch {
    // Do not serialize database errors, credentials, or private observations.
  }
  return (
    <Shell active="open-data">
      <OpenDataDashboard initialData={data} />
    </Shell>
  );
}
