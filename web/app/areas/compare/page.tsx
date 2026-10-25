import Link from 'next/link';
import { ProvinceCompare } from '@/components/province-compare';
import { Shell } from '@/components/shell';
import { first, type Params } from '@/lib/catalog';
import { REGION_BY_PROVINCE, REGIONS } from '@/lib/hub/weather-data';
import { getProvinces } from '@/lib/provinces';
import type { ProvinceOption } from '@/lib/province-compare';

export const metadata = { title: 'เปรียบเทียบข้ามจังหวัด' };

export default async function CompareProvincesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const provinces = await getProvinces();
  const params = await searchParams;
  const available = new Set(provinces.map((province) => province.code));
  const initialCodes = [...new Set(
    first(params.provinces)
      .split(',')
      .map((code) => code.trim())
      .filter((code) => /^\d{2}$/.test(code) && available.has(code)),
  )].slice(0, 3);
  const options: ProvinceOption[] = provinces.map((province) => {
    const region = REGIONS.find((row) => row.key === REGION_BY_PROVINCE[province.code]);
    return {
      code: province.code,
      name: province.name,
      regionKey: region?.key ?? '',
      regionLabel: region?.label ?? '',
    };
  });
  const registry = provinces[0];

  return <Shell active="areas">
    <nav className="breadcrumbs" aria-label="เส้นทางหน้า"><Link href="/areas">ข้อมูลตามจังหวัด</Link><span>/</span><span>เปรียบเทียบข้ามจังหวัด</span></nav>
    <div className="page-heading">
      <div>
        <h1>เปรียบเทียบข้ามจังหวัด</h1>
        <p>เลือก 2–3 จังหวัดเพื่อเทียบเฉพาะมิติที่ API v1 รองรับ ได้แก่ ฝนจากพยากรณ์ตัวอย่าง น้ำระดับภาค อ้างอิงชุดดินระดับภาค และอ้างอิงพืชระดับประเทศ ไม่ใช่การจัดอันดับจังหวัด</p>
      </div>
    </div>
    <ProvinceCompare provinces={options} initialCodes={initialCodes}/>
    <p className="area-note">
      ค่าฝนเป็นข้อมูลตัวอย่างที่คำนวณซ้ำได้จากพื้นที่และวันที่ เพื่อสาธิตหน้าจอ ไม่ใช่พยากรณ์ฉบับเผยแพร่ เพราะสิทธิ์ข้อมูลพยากรณ์ของกรมอุตุนิยมวิทยายังรอตรวจ ·
      ข้อมูลน้ำเป็นภาพรวมระดับภาคของกรมชลประทาน (6 ภาค) ไม่ใช่ระดับจังหวัด และรหัสจังหวัด 77 รหัสไม่ได้แปลว่ามีข้อมูลน้ำครบทุกจังหวัด ·
      อ้างอิงชุดดินเป็นเอกสารการสำรวจของกรมพัฒนาที่ดิน ไม่ใช่ขอบเขตจังหวัด ·
      อ้างอิงพืชเป็นข้อมูลระดับประเทศเท่านั้น ·
      ทะเบียนจังหวัด 77 รหัสใช้เพื่อการนำทาง ไม่ใช่การรับรองความครอบคลุมของข้อมูล
    </p>
    <p className="area-note">
      ดูเพิ่มเติม: <Link href="/areas">ข้อมูลตามจังหวัด</Link> · <Link href="/weather">สภาพอากาศ</Link> · <Link href="/water">แหล่งน้ำ</Link> · <Link href="/soil">ดินและปุ๋ย</Link> · <Link href="/crops">พืชผลเกษตร</Link> ·
      ทะเบียนจังหวัด: <a href={registry.sourceUrl} target="_blank" rel="noreferrer">มาตรฐานข้อมูลกระทรวงพาณิชย์</a> รุ่น {registry.sourceVersion}
    </p>
  </Shell>;
}
