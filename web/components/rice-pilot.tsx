import Link from 'next/link';
import { ProvinceEvidence } from './province-evidence';

export function RicePilot({ provinceCode, provinceName }: { provinceCode: string; provinceName: string }) {
  return <div>
    <section className="pilot-section" aria-labelledby="rice-evidence-heading">
      <h2 id="rice-evidence-heading">หลักฐานข้อมูลพืชของจังหวัด</h2>
      <p>หน้านี้ค้น metadata ที่ API กลางผูกกับนครปฐม หมวดพืช แยกจากข้อมูลระดับประเทศและจุดกริด ไม่มีการนำข้อมูลในเครื่องหรือบริการอากาศสดมาแสดง</p>
      <p>หากพบชุดข้อมูลจะแสดงชื่อ ที่มา ระดับพื้นที่ และเวลาที่อัปเดต ตัวเลขจะแสดงได้ต่อเมื่อทรัพยากรนั้นได้รับอนุมัติเผยแพร่จาก Hub แล้วเท่านั้น</p>
      <p><Link className="text-link" href="/catalog?category=crops">ดูบัญชีข้อมูลหมวดพืช</Link></p>
    </section>
    <ProvinceEvidence key={provinceCode + ':crops'} provinceCode={provinceCode} provinceName={provinceName} category="crops"/>
  </div>;
}
