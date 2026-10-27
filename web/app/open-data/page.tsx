import type { Metadata } from 'next';
import Link from 'next/link';
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
      <p className="area-note">
        ความพร้อมข้างบนประเมินจาก metadata หากต้องการดูว่าแต่ละหน่วยงานถูกอ่านสำเร็จครั้งล่าสุดเมื่อใด และรอบล่าสุดมีปัญหาหรือไม่{' '}
        <Link href="/data-status" className="text-link">
          เปิดหน้าสถานะแหล่งข้อมูล
        </Link>
      </p>
    </Shell>
  );
}
