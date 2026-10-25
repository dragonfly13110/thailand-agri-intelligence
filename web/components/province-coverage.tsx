import Link from 'next/link';
import type { Province } from '@/lib/provinces';

export function ProvinceCoverage({ provinces }: { provinces: Province[] }) {
  return <section className="province-coverage" aria-labelledby="province-coverage-title">
    <div className="section-heading">
      <div>
        <h2 id="province-coverage-title">เลือกจังหวัด</h2>
        <p>รหัสและชื่อจังหวัดใช้เป็นทะเบียนอ้างอิง ความครอบคลุมจริงต้องดูจากหลักฐานที่เชื่อมกับ API ของแต่ละจังหวัด</p>
      </div>
    </div>
    <p className="area-note" role="note">รายการจังหวัดไม่ได้หมายความว่ามีข้อมูลตัวเลขครบ และการไม่มีชุดข้อมูลที่ผูกได้ยังไม่ยืนยันว่าไม่มีผลผลิตหรือเหตุการณ์ในพื้นที่</p>
    <ul className="province-list" aria-label="รายชื่อจังหวัด">
      {provinces.map((province) => (
        <li key={province.code}>
          <Link href={'/areas/' + province.code}>
            {province.name}<span>รหัส {province.code}</span>
          </Link>
        </li>
      ))}
    </ul>
  </section>;
}
