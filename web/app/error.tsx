'use client';
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main className="empty-state"><h1>หน้านี้ยังไม่พร้อมใช้งาน</h1><p>โปรดลองเปิดอีกครั้ง ไม่สามารถอ่านข้อมูลได้ในขณะนี้</p><button className="button" onClick={reset}>ลองอีกครั้ง</button></main>;
}
