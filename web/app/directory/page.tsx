import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { PageDirectory } from '@/components/page-directory';

export const metadata: Metadata = {
  title: 'ดัชนีทุกหน้า',
  description: 'รวมทุกหน้าและทุกหมวดของศูนย์ข้อมูลเกษตรไทย พร้อมค้นหาด้วยชื่อหน้าหรือคำสำคัญ',
};

export default function DirectoryPage() {
  return (
    <Shell active="directory">
      <div className="page-heading">
        <div>
          <h1>ดัชนีทุกหน้า</h1>
          <p>ทุกบริการในระบบอยู่ในหน้านี้ — ค้นหาด้วยชื่อหน้าหรือคำสำคัญ แล้วเปิดใช้งานได้ทันที</p>
        </div>
      </div>
      <PageDirectory />
    </Shell>
  );
}
