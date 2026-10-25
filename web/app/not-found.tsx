import Link from 'next/link';
import { Shell } from '@/components/shell';
export default function NotFound() {
  return <Shell active="catalog"><div className="empty-state"><h1>ไม่พบหน้าที่ต้องการ</h1><p>ลิงก์อาจเปลี่ยนไป ลองค้นจากบัญชีข้อมูลอีกครั้ง</p><Link className="button" href="/catalog">ไปบัญชีข้อมูล</Link></div></Shell>;
}
