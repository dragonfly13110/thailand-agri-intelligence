'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './icon';
import styles from './shell.module.css';

export type ActiveNav =
  | 'home'
  | 'water'
  | 'prices'
  | 'crops'
  | 'soil'
  | 'weather'
  | 'livestock'
  | 'catalog'
  | 'data'
  | 'explore'
  | 'areas'
  | 'projects'
  | 'about'
  | 'early-warning'
  | 'satellite'
  | 'trade'
  | 'logistics'
  | 'smart-farming'
  | 'carbon'
  | 'finance'
  | 'machinery'
  | 'food-safety'
  | 'gi-products'
  | 'agri-tourism'
  | 'fertilizer'
  | 'labor'
  | 'climate-history'
  | 'cooperatives'
  | 'crop-evidence'
  | 'land-reform'
  | 'open-data';

interface NavItemConfig {
  id: ActiveNav;
  label: string;
  href: string;
  icon: IconName;
  /** Pages that belong to this menu group; used to keep the top-level tab highlighted. */
  children: ActiveNav[];
  submenus: Array<{
    title: string;
    desc: string;
    href: string;
    icon: IconName;
  }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'water',
    label: 'แหล่งน้ำ',
    href: '/water',
    icon: 'water',
    children: ['water', 'early-warning', 'satellite'],
    submenus: [
      {
        title: 'สถานการณ์แหล่งน้ำรายภูมิภาค',
        desc: 'โครงสร้างข้อมูลและแหล่งอ้างอิง ระหว่างรอตรวจสอบสิทธิ์',
        href: '/water',
        icon: 'water',
      },
      {
        title: 'ความเสี่ยงน้ำน้อย-น้ำเกิน',
        desc: 'รายการติดตามเมื่อได้รับอนุญาตให้เผยแพร่ตัวเลข',
        href: '/water',
        icon: 'pin',
      },
      {
        title: 'เตือนภัยน้ำท่วม-แล้งล่วงหน้า',
        desc: 'ตัวอย่างข้อมูลจำลอง 14 วัน พร้อมข้อจำกัดการใช้งาน',
        href: '/early-warning',
        icon: 'info',
      },
      {
        title: 'ดาวเทียมสำรวจโลกเพื่อการเกษตร',
        desc: 'น้ำท่วมซ้ำซาก ภัยแล้ง และ NDVI — ข้อมูลจำลองระหว่างรอตรวจสิทธิ์ GISTDA/Sentinel/MODIS',
        href: '/satellite',
        icon: 'layers',
      },
    ],
  },
  {
    id: 'prices',
    label: 'ราคาสินค้า',
    href: '/prices',
    icon: 'chart',
    children: ['prices', 'trade', 'finance'],
    submenus: [
      {
        title: 'ราคาสินค้าเกษตรรายวัน',
        desc: 'โครงสร้างราคาและแหล่งอ้างอิง (metadata-only)',
        href: '/prices',
        icon: 'chart',
      },
      {
        title: 'แนวโน้มราคาย้อนหลัง',
        desc: 'ตัวอย่างกราฟจำลองเพื่อสาธิตการแสดงผล',
        href: '/prices',
        icon: 'chart',
      },
      {
        title: 'การค้าต่างประเทศ',
        desc: 'ตัวอย่างสถิติส่งออก-นำเข้าและดุลการค้า',
        href: '/trade',
        icon: 'chart',
      },
      {
        title: 'สินเชื่อและประกันภัยพืชผล',
        desc: 'ตัวอย่างโครงการและแบบจำลองทางการเงิน',
        href: '/finance',
        icon: 'book',
      },
    ],
  },
  {
    id: 'crops',
    label: 'พืชผลเกษตร',
    href: '/crops',
    icon: 'leaf',
    children: ['crops', 'carbon', 'machinery', 'smart-farming', 'gi-products', 'crop-evidence'],
    submenus: [
      {
        title: 'พืชเศรษฐกิจและปฏิทินปลูก',
        desc: 'ปฏิทิน สายพันธุ์ และแหล่งอ้างอิง (ไม่รวมสถิติผลผลิต)',
        href: '/crops',
        icon: 'leaf',
      },
      {
        title: 'สิ่งบ่งชี้ทางภูมิศาสตร์ (GI)',
        desc: '122 รายการสินค้า GI ครบ 77 จังหวัด และการควบคุมคุณภาพ',
        href: '/gi-products',
        icon: 'pin',
      },
      {
        title: 'กระทบยอดทะเบียนแปลงเกษตร (ทบก.01)',
        desc: 'ตรวจสอบหลักฐานพื้นที่รายงาน ทะเบียนแปลง และดาวเทียม',
        href: '/crop-evidence',
        icon: 'search',
      },
      {
        title: 'คาร์บอนเครดิตภาคเกษตร',
        desc: 'ตัวอย่างโครงการและแบบจำลองคาร์บอน',
        href: '/carbon',
        icon: 'leaf',
      },
      {
        title: 'เครื่องจักรกลและบริการจ้างเหมา',
        desc: 'ตัวอย่างศูนย์บริการและอัตราค่าจ้าง',
        href: '/machinery',
        icon: 'layers',
      },
      {
        title: 'เกษตรอัจฉริยะและเซนเซอร์',
        desc: 'ตัวอย่างข้อมูลเซนเซอร์และคำแนะนำจำลอง',
        href: '/smart-farming',
        icon: 'sun',
      },
    ],
  },
  {
    id: 'soil',
    label: 'ดินและปุ๋ย',
    href: '/soil',
    icon: 'layers',
    children: ['soil', 'fertilizer'],
    submenus: [
      {
        title: 'กลุ่มชุดดินอ้างอิง (LDD)',
        desc: 'ตัวอย่างคำอธิบายชุดดินและแหล่งอ้างอิง',
        href: '/soil',
        icon: 'layers',
      },
      {
        title: 'คำแนะนำปุ๋ยสั่งตัด (N-P-K)',
        desc: 'สูตรผสมแม่ปุ๋ย 46-0-0, 18-46-0, 0-0-60 ตามค่าดิน',
        href: '/fertilizer',
        icon: 'pin',
      },
      {
        title: 'การปรับปรุงดินปัญหา',
        desc: 'ดินเปรี้ยว ดินเค็ม ดินทรายจัด',
        href: '/soil',
        icon: 'book',
      },
    ],
  },
  {
    id: 'weather',
    label: 'สภาพอากาศ',
    href: '/weather',
    icon: 'sun',
    children: ['weather', 'climate-history'],
    submenus: [
      {
        title: 'พยากรณ์เกษตร',
        desc: 'ตัวอย่างพยากรณ์จำลอง พร้อมข้อจำกัด',
        href: '/weather',
        icon: 'sun',
      },
      {
        title: 'ประวัติภูมิอากาศและแนวโน้ม 30 ปี',
        desc: 'สถิติย้อนหลัง ERA5 และความเปลี่ยนแปลงอุณหภูมิ/ฝน',
        href: '/climate-history',
        icon: 'chart',
      },
      {
        title: 'ฝนสะสมรายพื้นที่',
        desc: 'ตัวอย่างข้อมูลฝนจำลอง',
        href: '/weather',
        icon: 'water',
      },
      {
        title: 'เตือนภัยธรรมชาติเพื่อการเกษตร',
        desc: 'ตัวอย่างสถานการณ์จำลอง',
        href: '/weather',
        icon: 'info',
      },
    ],
  },
  {
    id: 'catalog',
    label: 'บัญชีข้อมูล',
    href: '/catalog',
    icon: 'catalog',
    children: [
      'catalog',
      'data',
      'explore',
      'areas',
      'livestock',
      'logistics',
      'food-safety',
      'projects',
      'open-data',
      'cooperatives',
      'land-reform',
      'labor',
      'agri-tourism',
    ],
    submenus: [
      {
        title: 'บัญชีข้อมูลต้นทาง',
        desc: 'รายการแหล่งข้อมูลและสถานะสิทธิ์',
        href: '/catalog',
        icon: 'catalog',
      },
      {
        title: 'สำรวจและกรองข้อมูล',
        desc: 'ค้นหาตามหมวดหมู่พืช น้ำ ดิน ราคา',
        href: '/explore',
        icon: 'search',
      },
      {
        title: 'คะแนนความพร้อมข้อมูลเปิด (Open Data)',
        desc: 'ประเมินความพร้อมและระดับดาว 1,237 ชุดข้อมูลภาครัฐ',
        href: '/open-data',
        icon: 'download',
      },
      {
        title: 'สหกรณ์การเกษตรและวิสาหกิจชุมชน',
        desc: 'CAMELS Rating และสถิติการรวบรวมผลผลิตเศรษฐกิจ',
        href: '/cooperatives',
        icon: 'book',
      },
      {
        title: 'เขตปฏิรูปที่ดิน ส.ป.ก. & โฉนดเกษตร',
        desc: 'การจัดสรรที่ดิน ส.ป.ก. 4-01 และความมั่นคงการถือครอง',
        href: '/land-reform',
        icon: 'pin',
      },
      {
        title: 'โครงสร้างแรงงานเกษตร & YSF',
        desc: 'สัดส่วนเกษตรกรสูงวัยและ Young Smart Farmer',
        href: '/labor',
        icon: 'chart',
      },
      {
        title: 'ท่องเที่ยวเชิงเกษตร & ศูนย์เรียนรู้',
        desc: 'แหล่งท่องเที่ยว ศูนย์เรียนรู้พระราชดำริ และเทศกาล',
        href: '/agri-tourism',
        icon: 'leaf',
      },
      {
        title: 'ปศุสัตว์และสัตว์น้ำ',
        desc: 'ตัวอย่างสถิติปศุสัตว์และสัตว์น้ำ',
        href: '/livestock',
        icon: 'animal',
      },
      {
        title: 'โลจิสติกส์และห้องเย็น',
        desc: 'ตัวอย่างโครงสร้างพื้นฐานและแบบจำลอง',
        href: '/logistics',
        icon: 'layers',
      },
      {
        title: 'ความปลอดภัยอาหาร',
        desc: 'ตัวอย่างมาตรฐานและการตรวจสอบย้อนกลับ',
        href: '/food-safety',
        icon: 'info',
      },
      {
        title: 'ข้อมูลรายจังหวัด',
        desc: 'ทะเบียนจังหวัดและหลักฐานข้อมูลรายพื้นที่',
        href: '/areas',
        icon: 'pin',
      },
      {
        title: 'โครงการและหลักฐาน',
        desc: 'ติดตามโครงการเมื่อมีข้อมูลต้นทาง',
        href: '/projects',
        icon: 'book',
      },
    ],
  },
];

export function Shell({
  active,
  children,
}: {
  active: ActiveNav;
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <a href="#main" className="skip-link">ข้ามไปเนื้อหา</a>

      {/* Top Header Navigation */}
      <header className={styles.topHeader}>
        <div className={styles.topInner}>
          {/* Logo & Brand */}
          <Link href="/" className={styles.topBrand}>
            <div className={styles.brandIcon}>
              <Icon name="leaf" size={22} />
            </div>
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>เกษตรไทย</span>
              <span className={styles.brandSub}>Agri-Intelligence Portal</span>
            </div>
          </Link>

          {/* Desktop Mega-Menu Nav */}
          <nav className={styles.navBar} aria-label="เมนูหลัก">
            <Link
              href="/"
              className={`${styles.navButton} ${active === 'home' ? styles.navButtonActive : ''}`}
            >
              หน้าหลัก
            </Link>

            {NAV_ITEMS.map((item) => {
              const isActive = active === item.id || item.children.includes(active);
              return (
                <div key={item.id} className={styles.navItem}>
                  <Link
                    href={item.href}
                    className={`${styles.navButton} ${isActive ? styles.navButtonActive : ''}`}
                  >
                    <Icon name={item.icon} size={17} />
                    <span>{item.label}</span>
                    <Icon name="chevronDown" size={13} className={styles.chevron} />
                  </Link>

                  {/* Dropdown Menu */}
                  <div className={styles.dropdownMenu}>
                    {item.submenus.map((sub) => (
                      <Link key={sub.title} href={sub.href} className={styles.dropdownLink}>
                        <div className={styles.dropdownLinkIcon}>
                          <Icon name={sub.icon} size={18} />
                        </div>
                        <div className={styles.dropdownLinkText}>
                          <span className={styles.dropdownLinkTitle}>{sub.title}</span>
                          <span className={styles.dropdownLinkDesc}>{sub.desc}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}

            <Link
              href="/about"
              className={`${styles.navButton} ${active === 'about' ? styles.navButtonActive : ''}`}
            >
              ที่มาข้อมูล
            </Link>
          </nav>

          {/* Right Status Badge & Mobile Toggle */}
          <div className={styles.rightActions}>
            <span className={styles.portalBadge}>
              <span className={styles.liveDot} /> เปิดเผยที่มาและสถานะข้อมูล
            </span>

            <button
              type="button"
              className={styles.mobileMenuBtn}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="เปิดเมนูมือถือ"
              aria-expanded={mobileMenuOpen}
            >
              <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={22} />
            </button>
          </div>
        </div>

        {/* Mobile Accordion Drawer */}
        <div className={`${styles.mobileDrawer} ${mobileMenuOpen ? styles.mobileDrawerOpen : ''}`}>
          <Link href="/" className={styles.mobileSubLink} onClick={() => setMobileMenuOpen(false)}>
            <strong>หน้าหลัก</strong>
            <span>ศูนย์กลางบริการข้อมูลการเกษตร</span>
          </Link>

          {NAV_ITEMS.map((item) => (
            <div key={item.id}>
              <Link
                href={item.href}
                className={styles.mobileCategoryTitle}
                style={{ display: 'block', textDecoration: 'none' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
              {item.submenus.map((sub) => (
                <Link
                  key={sub.title}
                  href={sub.href}
                  className={styles.mobileSubLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <strong>{sub.title}</strong>
                  <span>{sub.desc}</span>
                </Link>
              ))}
            </div>
          ))}

          <Link href="/about" className={styles.mobileSubLink} onClick={() => setMobileMenuOpen(false)}>
            <strong>ที่มาและการใช้ข้อมูล</strong>
            <span>นโยบายสิทธิ์และการตรวจสอบย้อนกลับ</span>
          </Link>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main id="main" tabIndex={-1} style={{ flex: 1, padding: '28px 32px 48px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {children}
      </main>

      {/* Portal Footer */}
      <footer className="footer" style={{ borderTop: '1px solid var(--line)', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)', background: '#ffffff', flexWrap: 'wrap', gap: 12 }}>
        <span>ศูนย์กลางสารสนเทศเกษตรไทย (Agri-Intelligence Portal) · ข้อมูลมีที่มา ตรวจสอบย้อนกลับได้</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link href="/water" style={{ color: 'var(--forest)' }}>แหล่งน้ำ</Link>
          <Link href="/prices" style={{ color: 'var(--forest)' }}>ราคาสินค้า</Link>
          <Link href="/catalog" style={{ color: 'var(--forest)' }}>บัญชีข้อมูล</Link>
          <Link href="/about" style={{ color: 'var(--forest)' }}>นโยบายการใช้ข้อมูล</Link>
        </div>
      </footer>
    </div>
  );
}
