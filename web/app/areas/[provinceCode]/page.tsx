import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ProvinceAgriOverview } from '@/components/province-agri-overview';
import { ProvinceEvidence } from '@/components/province-evidence';
import { getProvinces } from '@/lib/provinces';

export const metadata = { title: 'ข้อมูลตามจังหวัด' };
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getProvinces()).map((row) => ({ provinceCode: row.code }));
}

export default async function ProvincePage({ params }: { params: Promise<{ provinceCode: string }> }) {
  const provinces = await getProvinces();
  const { provinceCode } = await params;
  const area = provinces.find((row) => row.code === provinceCode);
  if (!area) notFound();

  return <Shell active="areas">
    <nav className="breadcrumbs" aria-label="เส้นทางหน้า"><Link href="/areas">ข้อมูลตามจังหวัด</Link><span>/</span><span>{area.name}</span></nav>
    <div className="page-heading">
      <div>
        <h1>{area.name}</h1>
        <p>ตรวจหลักฐานที่เชื่อมกับพื้นที่ผ่าน API กลาง · รหัสจังหวัด {area.code}</p>
      </div>
    </div>
    <ProvinceAgriOverview key={area.code + ':agri'} provinceCode={area.code} provinceName={area.name}/>
    <form className="data-filters" action="/areas" method="get">
      <div>
        <label htmlFor="province-code">เปลี่ยนจังหวัด</label>
        <select id="province-code" name="provinceCode" defaultValue={area.code}>
          {provinces.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
        </select>
      </div>
      <button className="button" type="submit">ดูข้อมูลจังหวัด</button>
    </form>
    <p className="area-note">ตัวเลขจะแสดงเมื่อชุดข้อมูลมีทรัพยากรที่อนุมัติและระดับพื้นที่ตรงกับจังหวัดเท่านั้น ระบบจะไม่แทนข้อมูลประเทศ จุดกริด หรือค่าที่ขาดด้วยค่าของจังหวัด</p>
    <ProvinceEvidence key={area.code} provinceCode={area.code} provinceName={area.name}/>
    <p className="area-note">ทะเบียนจังหวัด: <a href={area.sourceUrl} target="_blank" rel="noreferrer">มาตรฐานข้อมูลกระทรวงพาณิชย์</a> รุ่น {area.sourceVersion} · ใช้อ้างอิงรหัส ไม่รับรองความครอบคลุมของข้อมูล</p>
  </Shell>;
}
