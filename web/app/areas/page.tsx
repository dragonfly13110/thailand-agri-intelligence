import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ProvinceCoverage } from '@/components/province-coverage';
import { first, type Params } from '@/lib/catalog';
import { getProvinces } from '@/lib/provinces';

export const metadata = { title: 'ข้อมูลตามจังหวัด' };

export default async function AreasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const provinces = await getProvinces();
  const params = await searchParams;
  const selected = provinces.find((row) => row.code === first(params.provinceCode));
  if (selected) redirect('/areas/' + selected.code);

  return <Shell active="areas">
    <div className="page-heading">
      <div>
        <h1>ข้อมูลตามจังหวัด</h1>
        <p>เลือกจังหวัดเพื่อดูว่ามีชุดข้อมูลใดเชื่อมกับพื้นที่ พร้อมที่มาและระดับข้อมูล</p>
      </div>
      <Link className="button secondary" href="/areas/compare">เปรียบเทียบข้ามจังหวัด</Link>
    </div>
    <form className="data-filters" action="/areas" method="get">
      <div>
        <label htmlFor="province-code">เลือกจังหวัด</label>
        <select id="province-code" name="provinceCode" defaultValue="">
          <option value="">เลือกจากรายชื่อ</option>
          {provinces.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
        </select>
      </div>
      <button className="button" type="submit">ดูข้อมูลจังหวัด</button>
    </form>
    <p className="area-note">รหัสจังหวัดเป็นทะเบียนอ้างอิงเท่านั้น ตัวเลขจะแสดงเมื่อแหล่งข้อมูลเชื่อมได้และได้รับอนุมัติให้เผยแพร่</p>
    <ProvinceCoverage provinces={provinces}/>
  </Shell>;
}
