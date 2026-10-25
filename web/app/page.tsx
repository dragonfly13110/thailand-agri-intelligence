import Link from 'next/link';
import { Shell } from '@/components/shell';
import { Icon } from '@/components/icon';
import { HubCatalog } from '@/components/hub-catalog';
import { WATER_SOURCE_METADATA } from '@/lib/hub/water-data';
import { PRICE_COMMODITIES, PRICE_SOURCE_METADATA } from '@/lib/hub/price-data';

export default function Home() {
  const commodities = PRICE_COMMODITIES;

  return (
    <Shell active="home">
      {/* Hero Welcome Banner */}
      <section style={{
        background: 'linear-gradient(135deg, #1c382b 0%, #2b533f 100%)',
        color: '#ffffff',
        borderRadius: 16,
        padding: '36px 40px',
        marginBottom: 32,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 24,
        boxShadow: '0 8px 24px rgba(28, 56, 43, 0.15)'
      }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#99e28d' }} />
            พอร์ทัลข้อมูลเกษตรกรอัจฉริยะ (Agri-Intelligence Portal)
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.3, letterSpacing: -0.6, margin: '0 0 12px' }}>
            ข้อมูลเกษตรไทยจากหน่วยงานต้นทาง<br/>
            <span style={{ color: '#d9e8a0' }}>พร้อมสถานะสิทธิ์ที่ตรวจสอบได้</span>
          </h1>
          <p style={{ fontSize: 15, color: '#e0ece4', margin: 0, lineHeight: 1.7 }}>
            รวมบัญชีข้อมูล แหล่งอ้างอิง และสถานะการตรวจสิทธิ์ราย resource ตัวเลขที่ยังไม่ได้รับอนุญาต
            จะไม่ถูกแสดงในหน้าเว็บหรือ public API จนกว่าจะผ่านการตรวจและมีหลักฐานครบ
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/catalog" style={{ background: '#d9e8a0', color: '#1c382b', padding: '12px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <Icon name="catalog" size={18} /> ค้นบัญชีข้อมูลกลาง
          </Link>
          <Link href="/water" style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', padding: '12px 22px', borderRadius: 8, fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            <Icon name="water" size={18} /> ดูสถานะข้อมูลน้ำ
          </Link>
        </div>
      </section>

      {/* Data-rights status row (metadata only, no pending numeric values) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24, marginBottom: 36 }}>
        {/* Water status card */}
        <div style={{ background: '#ffffff', border: '1px solid #dce5da', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 2px 8px rgba(33,61,50,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e3f2fd', color: '#1565c0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="water" size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1a3328', margin: 0 }}>สถานการณ์น้ำอ่างเก็บน้ำขนาดกลาง</h2>
                <small style={{ color: '#7b8e84' }}>{WATER_SOURCE_METADATA.sourceName} · metadata only</small>
              </div>
            </div>
            <Link href="/water" style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600, textDecoration: 'none' }}>
              ดูรายละเอียด &rarr;
            </Link>
          </div>

          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 14px', color: '#6d4f00', fontSize: 13, lineHeight: 1.7 }}>
            <strong>ยังไม่เปิดเผยตัวเลขน้ำ</strong>
            <div style={{ marginTop: 4 }}>
              ปริมาณน้ำ ความจุ เปอร์เซ็นต์ และจำนวนอ่างไม่ถูกแสดงใน HTML, props, API หรือ cache
              เพราะทะเบียนสิทธิ์ของรายงานอ่างเก็บน้ำยังเป็น <code>pending</code>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, fontWeight: 600 }}>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: '#fff8e1', color: '#8d6e00' }}>
              สิทธิ์: {WATER_SOURCE_METADATA.licenseStatus}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: '#eceff1', color: '#455a64' }}>
              access: {WATER_SOURCE_METADATA.access}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: '#eceff1', color: '#455a64' }}>
              completeness: unknown
            </span>
          </div>

          <a href={WATER_SOURCE_METADATA.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#556b60' }}>
            เอกสารต้นทาง: กรมชลประทาน (RID)
          </a>
        </div>

        {/* Prices status card */}
        <div style={{ background: '#ffffff', border: '1px solid #dce5da', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 2px 8px rgba(33,61,50,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fdf3e7', color: '#b78103', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chart" size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1a3328', margin: 0 }}>ราคาสินค้าเกษตร</h2>
                <small style={{ color: '#7b8e84' }}>{PRICE_SOURCE_METADATA.sourceName} · metadata only</small>
              </div>
            </div>
            <Link href="/prices" style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600, textDecoration: 'none' }}>
              ดูรายละเอียด &rarr;
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {commodities.map((item) => (
              <div key={item.id} style={{ background: '#fafbfa', border: '1px solid #eef2ed', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#334e3f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name.split('(')[0]}
                </div>
                <div style={{ fontSize: 11, color: '#7b8e84', marginTop: 4 }}>{item.unit} · ยังไม่มีราคา</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#6d4f00', lineHeight: 1.7 }}>
            ราคา เปลี่ยนแปลง และประวัติราคาไม่ถูกแสดง เพราะทะเบียนสิทธิ์ของ OAE/NABC ยังเป็น{' '}
            <code>pending</code> และยังไม่ยืนยันรุ่น/URL ของสัญญาอนุญาต
          </div>
        </div>
      </div>

      {/* Main Feature Categories */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a3328', marginBottom: 16 }}>
          หมวดหมู่บริการสารสนเทศเกษตรกร
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {[
            { href: '/water', title: 'แหล่งน้ำและชลประทาน', desc: 'รายงานอ่างเก็บน้ำรายวัน (รอตรวจสิทธิ์)', icon: 'water', color: '#e3f2fd', ink: '#1565c0' },
            { href: '/prices', title: 'ราคาสินค้าเกษตร', desc: 'รายการสินค้าและตลาด (รอตรวจสิทธิ์)', icon: 'chart', color: '#fef3e0', ink: '#b26b00' },
            { href: '/crops', title: 'พืชผลและผลผลิต', desc: 'ปฏิทินเพาะปลูกและพันธุ์พืช', icon: 'leaf', color: '#e8f5e9', ink: '#2e7d32' },
            { href: '/soil', title: 'ดินและปุ๋ย', desc: 'กลุ่มชุดดินและคำแนะนำปุ๋ย', icon: 'layers', color: '#f3e5f5', ink: '#7b1fa2' },
            { href: '/weather', title: 'สภาพอากาศและฝน', desc: 'พยากรณ์เพื่อการเกษตร (ข้อมูลตัวอย่าง)', icon: 'sun', color: '#fff9c4', ink: '#f57f17' },
            { href: '/catalog', title: 'บัญชีข้อมูลกลาง', desc: 'สืบค้นแคตตาล็อกจากหน่วยงานรัฐ', icon: 'catalog', color: '#e0f2f1', ink: '#00695c' },
          ].map(cat => (
            <Link
              key={cat.href}
              href={cat.href}
              style={{
                background: '#ffffff',
                border: '1px solid #dce5da',
                borderRadius: 10,
                padding: '16px 18px',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(33,61,50,0.03)'
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 8, background: cat.color, color: cat.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={cat.icon as any} size={18} />
              </div>
              <strong style={{ fontSize: 14, color: '#1a3328' }}>{cat.title}</strong>
              <span style={{ fontSize: 12, color: '#6a7d73', lineHeight: 1.4 }}>{cat.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Catalog Search & Preview */}
      <section style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a3328', margin: 0 }}>บัญชีข้อมูลเกษตรกลาง</h2>
            <p style={{ fontSize: 13, color: '#556b60', margin: '4px 0 0' }}>ค้นหาและตรวจสอบที่มาของชุดข้อมูลจากหน่วยงานรัฐ</p>
          </div>
          <Link href="/catalog" style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600, textDecoration: 'none' }}>
            ค้นหาทั้งหมด &rarr;
          </Link>
        </div>

        <HubCatalog compact />
      </section>
    </Shell>
  );
}
