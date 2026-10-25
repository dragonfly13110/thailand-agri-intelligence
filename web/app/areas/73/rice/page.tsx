import Link from 'next/link';
import { Shell } from '@/components/shell';
import { RicePilot } from '@/components/rice-pilot';

export const metadata = { title: 'ข้อมูลข้าวนครปฐม' };

export default function RicePilotPage() {
  return <Shell active="areas">
    <nav className="breadcrumbs" aria-label="เส้นทางหน้า"><Link href="/areas">ข้อมูลตามจังหวัด</Link><span>/</span><Link href="/areas/73">นครปฐม</Link><span>/</span><span>ข้อมูลข้าว</span></nav>
    <div className="page-heading">
      <div>
        <h1>ข้อมูลข้าวนครปฐม</h1>
        <p>ตรวจที่มาและหลักฐานที่เชื่อมกับจังหวัด โดยไม่รวมข้อมูลคนละพื้นที่หรือช่วงเวลา</p>
      </div>
    </div>
    <RicePilot provinceCode="73" provinceName="นครปฐม"/>
  </Shell>;
}
