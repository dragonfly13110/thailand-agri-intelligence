import Link from 'next/link';
import { categories, type CatalogRecord, type Category } from '@/lib/catalog';
import { Icon, type IconName } from './icon';

export const categoryIcons: Record<Category, IconName> = {crops:'leaf', prices:'chart', water:'water', land:'pin', fisheries:'fish', livestock:'animal'};

export function CatalogList({records}: {records: CatalogRecord[]}) {
  return <div className="catalog-list">
    <div className="list-heading" aria-hidden="true"><span>ชุดข้อมูล</span><span>หน่วยงาน / ระดับข้อมูล</span><span>สิทธิ์ข้อมูลต้นทาง</span><span/></div>
    <ol>
      {records.map(row => <li key={row.id} className="catalog-row">
        <div className={'record-icon ' + row.category}><Icon name={categoryIcons[row.category]} size={23}/></div>
        <div className="record-main"><h3><Link href={'/catalog/' + row.id}>{row.title}</Link></h3><p>{row.description}</p><span className="record-category">หมวด: {categories[row.category]}</span></div>
        <div className="record-source"><span>{row.source_label}</span><small>{row.grain}</small></div>
        <div className="record-status"><span className="badge pending">{row.data_license_status === 'approved_public' ? 'ตรวจสิทธิ์แล้ว' : row.data_license_status === 'restricted' ? 'จำกัดสิทธิ์' : 'รอตรวจสิทธิ์'}</span><small>เปิดดูคำอธิบายได้</small></div>
        <Link className="record-arrow" href={'/catalog/' + row.id} aria-label={'ดูรายละเอียด ' + row.title}><Icon name="arrow" size={19}/></Link>
      </li>)}
    </ol>
  </div>;
}

export function CatalogUnavailable() {
  return <div className="empty-state" role="status"><Icon name="info" size={32}/><h2>ยังเปิดบัญชีข้อมูลไม่ได้</h2><p>ไฟล์บัญชีข้อมูลไม่พร้อมใช้งาน โปรดลองอีกครั้งภายหลัง</p><Link className="button secondary" href="/catalog">ลองเปิดอีกครั้ง</Link></div>;
}
