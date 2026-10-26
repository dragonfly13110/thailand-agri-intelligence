'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './icon';
import {
  PAGE_GROUPS,
  PAGES,
  pageLabel,
  pagesInGroup,
  type PageEntry,
  type PageId,
} from './page-registry';
import styles from './shell.module.css';

export type ActiveNav = PageId;

const BOTTOM_NAV: Array<{ href: string; label: string; icon: IconName; active: PageId[] }> = [
  { href: '/', label: 'หน้าหลัก', icon: 'home', active: ['home'] },
  { href: '/water', label: 'น้ำ', icon: 'water', active: ['water', 'early-warning', 'satellite'] },
  { href: '/prices', label: 'ราคา', icon: 'chart', active: ['prices', 'trade', 'finance'] },
  { href: '/crops', label: 'พืช', icon: 'leaf', active: ['crops', 'soil', 'fertilizer', 'gi-products', 'carbon', 'machinery', 'smart-farming', 'crop-evidence'] },
  { href: '/directory', label: 'ทุกหน้า', icon: 'catalog', active: ['directory'] },
];

function matches(page: PageEntry, query: string): boolean {
  if (!query) return true;
  const haystack = `${page.label} ${page.description} ${page.keywords ?? ''}`.toLocaleLowerCase('th');
  return haystack.includes(query.trim().toLocaleLowerCase('th'));
}

function NavList({
  query = '',
  active,
  openGroups,
  onToggleGroup,
  onNavigate,
  variant = 'sidebar',
}: {
  query?: string;
  active: PageId;
  openGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onNavigate?: () => void;
  variant?: 'sidebar' | 'drawer';
}) {
  return (
    <div className={`${styles.navGroups} ${variant === 'drawer' ? styles.navGroupsDrawer : ''}`}>
      {PAGE_GROUPS.map((group) => {
        const items = pagesInGroup(group.id).filter((page) => matches(page, query));
        if (items.length === 0) return null;
        const isOpen = query ? true : openGroups.has(group.id);
        const hasActive = items.some((page) => page.active === active);
        return (
          <section key={group.id} className={styles.navGroup}>
            <button
              type="button"
              className={`${styles.navGroupButton} ${hasActive ? styles.navGroupButtonActive : ''}`}
              onClick={() => onToggleGroup(group.id)}
              aria-expanded={isOpen}
            >
              <span className={styles.navGroupIcon}><Icon name={group.icon} size={17} /></span>
              <span className={styles.navGroupText}>
                <span className={styles.navGroupLabel}>{group.label}</span>
                <span className={styles.navGroupCount}>{items.length}</span>
              </span>
              <Icon name="chevronDown" size={14} className={`${styles.groupChevron} ${isOpen ? styles.groupChevronOpen : ''}`} />
            </button>
            {isOpen && (
              <ul className={styles.navList}>
                {items.map((page) => {
                  const isCurrent = page.active === active;
                  return (
                    <li key={page.key}>
                      <Link
                        href={page.href}
                        className={`${styles.navLink} ${isCurrent ? styles.navLinkActive : ''}`}
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={onNavigate}
                      >
                        <Icon name={page.icon} size={16} className={styles.navLinkIcon} />
                        <span className={styles.navLinkText}>
                          <span>{page.label}</span>
                          {variant === 'drawer' && <small>{page.description}</small>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function Shell({
  active,
  children,
}: {
  active: ActiveNav;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [mobileQuery, setMobileQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(PAGE_GROUPS.map((group) => group.id)),
  );
  const paletteInputRef = useRef<HTMLInputElement>(null);

  const currentPage =
    PAGES.find((page) => page.href === pathname) ?? PAGES.find((page) => page.active === active);
  const currentGroup = PAGE_GROUPS.find((group) => group.id === currentPage?.group);

  const paletteResults = useMemo(() => PAGES.filter((page) => matches(page, paletteQuery)), [paletteQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const locked = mobileOpen || paletteOpen;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen, paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    setPaletteIndex(0);
    const timer = window.setTimeout(() => paletteInputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [paletteOpen, paletteQuery]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const go = (href: string) => {
    setPaletteOpen(false);
    setMobileOpen(false);
    router.push(href);
  };

  const onPaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setPaletteIndex((index) => Math.min(index + 1, paletteResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setPaletteIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && paletteResults[paletteIndex]) {
      event.preventDefault();
      go(paletteResults[paletteIndex].href);
    }
  };

  return (
    <div className={styles.shell}>
      <a href="#main" className="skip-link">ข้ามไปเนื้อหา</a>

      <aside className={styles.sidebar} aria-label="เมนูหลัก">
        <Link href="/" className={styles.brand} onClick={() => setMobileOpen(false)}>
          <span className={styles.brandMark}><Icon name="leaf" size={24} /></span>
          <span className={styles.brandText}>
            <strong>เกษตรไทย</strong>
            <small>Agri-Intelligence Portal</small>
          </span>
        </Link>

        <button type="button" className={styles.searchTrigger} onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={17} />
          <span>ค้นหาทุกหน้า</span>
          <kbd>Ctrl K</kbd>
        </button>

        <nav className={styles.sidebarNav} aria-label="เมนูทุกหน้า">
          <NavList
            active={active}
            openGroups={openGroups}
            onToggleGroup={toggleGroup}
            onNavigate={() => setMobileOpen(false)}
          />
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.sidebarStatus}><span className={styles.statusDot} /> เปิดเผยที่มาและสถานะข้อมูล</span>
          <div className={styles.sidebarFooterLinks}>
            <Link href="/directory">ดัชนีทุกหน้า</Link>
            <Link href="/about">ที่มาและสิทธิ์</Link>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setMobileOpen(true)}
              aria-label="เปิดเมนูทั้งหมด"
              aria-expanded={mobileOpen}
            >
              <Icon name="menu" size={22} />
            </button>
            <nav className={styles.breadcrumbs} aria-label="ตำแหน่งหน้า">
              <Link href="/">หน้าหลัก</Link>
              {currentGroup && currentGroup.id !== 'overview' && (
                <>
                  <span aria-hidden="true">/</span>
                  <span>{currentGroup.label}</span>
                </>
              )}
              {currentPage && currentPage.key !== 'home' && (
                <>
                  <span aria-hidden="true">/</span>
                  <strong>{currentPage.label}</strong>
                </>
              )}
            </nav>
          </div>

          <div className={styles.topbarActions}>
            <button type="button" className={styles.topSearch} onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={16} />
              <span>ค้นหาทุกหน้า</span>
              <kbd>Ctrl K</kbd>
            </button>
            <Link href="/directory" className={styles.iconButton} aria-label="ดัชนีทุกหน้า" title="ดัชนีทุกหน้า">
              <Icon name="catalog" size={18} />
            </Link>
            <span className={styles.statusPill}><span className={styles.statusDot} /> เปิดเผยที่มา</span>
          </div>
        </header>

        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <strong>ศูนย์ข้อมูลเกษตรไทย</strong>
            <span>ข้อมูลมีที่มา ตรวจสอบย้อนกลับได้</span>
          </div>
          <nav className={styles.footerLinks} aria-label="ลิงก์ท้ายเว็บ">
            <Link href="/directory">ทุกหน้า</Link>
            <Link href="/catalog">บัญชีข้อมูล</Link>
            <Link href="/about">นโยบายการใช้ข้อมูล</Link>
            <Link href="/open-data">ความพร้อมข้อมูลเปิด</Link>
          </nav>
        </footer>
      </div>

      {mobileOpen && (
        <div className={styles.drawerBackdrop} onClick={() => setMobileOpen(false)}>
          <div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="เมนูทั้งหมด"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <Link href="/" className={styles.brand} onClick={() => setMobileOpen(false)}>
                <span className={styles.brandMark}><Icon name="leaf" size={22} /></span>
                <span className={styles.brandText}>
                  <strong>เกษตรไทย</strong>
                  <small>ทุกหน้าของระบบ</small>
                </span>
              </Link>
              <button type="button" className={styles.closeButton} onClick={() => setMobileOpen(false)} aria-label="ปิดเมนู">
                <Icon name="close" size={22} />
              </button>
            </div>
            <label className={styles.drawerSearch}>
              <Icon name="search" size={18} />
              <input
                type="search"
                value={mobileQuery}
                onChange={(event) => setMobileQuery(event.target.value)}
                placeholder="ค้นหาหน้า เช่น น้ำ ราคา จังหวัด"
                autoFocus
              />
            </label>
            <NavList
              query={mobileQuery}
              active={active}
              openGroups={openGroups}
              onToggleGroup={toggleGroup}
              onNavigate={() => setMobileOpen(false)}
              variant="drawer"
            />
          </div>
        </div>
      )}

      {paletteOpen && (
        <div className={styles.paletteBackdrop} onClick={() => setPaletteOpen(false)}>
          <div
            className={styles.palette}
            role="dialog"
            aria-modal="true"
            aria-label="ค้นหาทุกหน้า"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.paletteInputRow}>
              <Icon name="search" size={19} />
              <input
                ref={paletteInputRef}
                type="search"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                onKeyDown={onPaletteKeyDown}
                placeholder="พิมพ์ชื่อหน้า หรือคำสำคัญ เช่น น้ำ ราคา GI จังหวัด"
                aria-label="ค้นหาหน้า"
              />
              <kbd>Esc</kbd>
            </div>
            <div className={styles.paletteResults}>
              {paletteResults.length === 0 && (
                <div className={styles.paletteEmpty}>
                  ไม่พบหน้าที่ตรงกับ “{paletteQuery}” — ลองใช้คำสั้นลง
                </div>
              )}
              {paletteResults.map((page, index) => (
                <button
                  type="button"
                  key={page.key}
                  className={`${styles.paletteItem} ${index === paletteIndex ? styles.paletteItemActive : ''}`}
                  onMouseEnter={() => setPaletteIndex(index)}
                  onClick={() => go(page.href)}
                >
                  <span className={styles.paletteIcon}><Icon name={page.icon} size={18} /></span>
                  <span className={styles.paletteText}>
                    <strong>{page.label}</strong>
                    <small>{page.description}</small>
                  </span>
                  <span className={styles.paletteGroup}>{PAGE_GROUPS.find((group) => group.id === page.group)?.label}</span>
                </button>
              ))}
            </div>
            <div className={styles.paletteHint}>
              <span><kbd>↑</kbd><kbd>↓</kbd> เลือก</span>
              <span><kbd>Enter</kbd> เปิด</span>
              <span><kbd>Esc</kbd> ปิด</span>
            </div>
          </div>
        </div>
      )}

      <nav className={styles.bottomNav} aria-label="เมนูลัดมือถือ">
        {BOTTOM_NAV.map((item) => {
          const isCurrent = item.active.includes(active);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.bottomNavLink} ${isCurrent ? styles.bottomNavLinkActive : ''}`}
              aria-current={isCurrent ? 'page' : undefined}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
