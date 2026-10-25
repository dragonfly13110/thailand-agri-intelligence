import Link from 'next/link';
import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { Icon } from '@/components/icon';

export const metadata: Metadata = { title: 'โครงการและหลักฐาน' };

export default function ProjectsPage() {
  return <Shell active="projects">
    <div className="page-heading">
      <div>
        <h1>โครงการและหลักฐาน</h1>
        <p>ติดตามโครงการได้เมื่อมีทะเบียนและ API ที่ระบุพื้นที่ เป้าหมาย เวลา และผลการดำเนินงานจากต้นทาง</p>
      </div>
    </div>
    <section className="empty-state" role="status">
      <Icon name="info" size={30}/>
      <h2>ยังไม่มีข้อมูลโครงการใน API ของ Hub</h2>
      <p>หน้านี้ยังไม่แสดงประกาศหรือผลดำเนินงานที่ฝังไว้ในเว็บ เพื่อไม่ให้ข้อมูลเก่าถูกเข้าใจว่าเป็นสถานะปัจจุบัน และไม่สรุปผลเมื่อข้อมูลเป้าหมายกับผลจริงยังเชื่อมกันไม่ได้</p>
      <p>เมื่อเชื่อมแหล่งข้อมูลแล้ว ระบบจะแยกแผน ประกาศ การดำเนินงาน และผลที่ตรวจสอบได้ตามหลักฐานต้นทาง</p>
      <Link className="button secondary" href="/catalog?q=%E0%B9%82%E0%B8%84%E0%B8%A3%E0%B8%87%E0%B8%81%E0%B8%B2%E0%B8%A3">ค้นชุดข้อมูลที่เกี่ยวกับโครงการ<Icon name="arrow" size={16}/></Link>
    </section>
  </Shell>;
}
