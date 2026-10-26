import Link from 'next/link';
import { Shell } from '@/components/shell';
import { Icon, type IconName } from '@/components/icon';
import { HubCatalog } from '@/components/hub-catalog';
import { PAGE_GROUPS, PAGES, pagesInGroup } from '@/components/page-registry';
import styles from './home.module.css';

export const metadata = { title: 'หน้าหลัก' };

const QUICK_LINKS: Array<{ href: string; label: string; description: string; icon: IconName }> = [
  { href: '/prices', label: 'ราคาสินค้าเกษตร', description: 'ราคาและแหล่งอ้างอิงรายสินค้า', icon: 'chart' },
  { href: '/water', label: 'สถานการณ์น้ำ', description: 'อ่างเก็บน้ำและสถานะข้อมูลน้ำ', icon: 'water' },
  { href: '/early-warning', label: 'เตือนภัยน้ำ', description: 'น้ำท่วมและภัยแล้งล่วงหน้า', icon: 'info' },
  { href: '/areas', label: 'ข้อมูลรายจังหวัด', description: 'เปิดหลักฐานรายพื้นที่ 77 จังหวัด', icon: 'pin' },
  { href: '/weather', label: 'สภาพอากาศ', description: 'พยากรณ์และภูมิอากาศย้อนหลัง', icon: 'sun' },
  { href: '/catalog', label: 'บัญชีข้อมูลกลาง', description: 'ค้นชุดข้อมูลและสถานะสิทธิ์', icon: 'catalog' },
];

export default function Home() {
  return (
    <Shell active="home">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            ศูนย์ข้อมูลเกษตรไทย · TADIH
          </span>
          <h1 className={styles.heroTitle}>
            ข้อมูลเกษตรจากต้นทาง<br />
            <span>เปิดใช้ได้ในที่เดียว</span>
          </h1>
          <p className={styles.heroLead}>
            รวมน้ำ ราคา พืช ดิน อากาศ พื้นที่ และข้อมูลชุมชน พร้อมที่มา ระดับพื้นที่
            และสถานะสิทธิ์ของทุกชุดข้อมูล ให้ตรวจสอบย้อนกลับได้ก่อนนำไปใช้
          </p>
          <div className={styles.heroActions}>
            <Link href="/directory" className={styles.primaryAction}>
              <Icon name="catalog" size={17} />
              เปิดดัชนีทุกหน้า
            </Link>
            <Link href="/catalog" className={styles.ghostAction}>
              <Icon name="search" size={17} />
              ค้นบัญชีข้อมูล
            </Link>
          </div>
        </div>

        <div className={styles.heroAside}>
          <span className={styles.heroAsideTitle}>ทางเข้าเร็ว</span>
          <div className={styles.heroStat}>
            <strong>{PAGES.length}</strong>
            <span>หน้าข้อมูลในระบบ</span>
          </div>
          <div className={styles.heroStat}>
            <strong>{PAGE_GROUPS.length}</strong>
            <span>หมวดบริการ</span>
          </div>
          <div className={styles.heroStat}>
            <strong>77</strong>
            <span>จังหวัดที่ตรวจได้</span>
          </div>
          <Link href="/directory" className={styles.heroAsideLink}>
            ดูทุกหน้าพร้อมคำอธิบาย
            <Icon name="arrow" size={14} />
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>เริ่มจากงานที่ใช้บ่อย</h2>
            <p>ทางลัดไปยังหน้าหลักที่เปิดใช้งานบ่อยที่สุด</p>
          </div>
          <Link href="/directory" className={styles.sectionLink}>
            ดูทั้งหมด
            <Icon name="arrow" size={14} />
          </Link>
        </div>
        <div className={styles.quickGrid}>
          {QUICK_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.quickCard}>
              <span className={styles.quickIcon}><Icon name={item.icon} size={19} /></span>
              <span className={styles.quickText}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>ทุกหมวดบริการ</h2>
            <p>ทุกหน้าในระบบมีทางเข้าจากที่นี่และจากเมนูด้านข้าง</p>
          </div>
          <Link href="/directory" className={styles.sectionLink}>
            เปิดดัชนีทุกหน้า
            <Icon name="arrow" size={14} />
          </Link>
        </div>
        <div className={styles.groupGrid}>
          {PAGE_GROUPS.map((group) => {
            const items = pagesInGroup(group.id).filter((page) => page.key !== 'home');
            return (
              <section key={group.id} className={styles.groupCard}>
                <div className={styles.groupHead}>
                  <span className={styles.groupIcon}><Icon name={group.icon} size={18} /></span>
                  <span className={styles.groupHeadText}>
                    <strong>{group.label}</strong>
                    <span>{group.description}</span>
                  </span>
                  <span className={styles.groupCount}>{items.length} หน้า</span>
                </div>
                <div className={styles.groupLinks}>
                  {items.map((page) => (
                    <Link key={page.key} href={page.href} className={styles.groupLink}>
                      <Icon name={page.icon} size={13} />
                      {page.label}
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <div className={styles.noteStrip}>
        <Icon name="info" size={18} />
        <div>
          <strong>หาไม่เจอ?</strong> กด <kbd>Ctrl</kbd> + <kbd>K</kbd> เพื่อค้นหาทุกหน้าจากชื่อหรือคำสำคัญ
          หรือเปิด <Link href="/directory">ดัชนีทุกหน้า</Link> · ตรวจข้อจำกัดและสิทธิ์ได้ที่{' '}
          <Link href="/about">ที่มาและสิทธิ์</Link>
        </div>
      </div>

      <section className={styles.catalogSection}>
        <div className={styles.sectionHead}>
          <div>
            <h2>บัญชีข้อมูลเกษตรกลาง</h2>
            <p>ค้นหาและตรวจสอบที่มาของชุดข้อมูลจากหน่วยงานรัฐ</p>
          </div>
          <Link href="/catalog" className={styles.sectionLink}>
            ค้นหาทั้งหมด
            <Icon name="arrow" size={14} />
          </Link>
        </div>
        <HubCatalog compact />
      </section>
    </Shell>
  );
}
