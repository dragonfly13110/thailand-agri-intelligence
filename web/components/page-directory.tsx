'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from './icon';
import { PAGE_GROUPS, PAGES, pagesInGroup } from './page-registry';
import styles from './page-directory.module.css';

export function PageDirectory() {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('th');

  const groups = useMemo(
    () =>
      PAGE_GROUPS.map((group) => ({
        ...group,
        pages: pagesInGroup(group.id).filter((page) => {
          if (!normalized) return true;
          const haystack = `${page.label} ${page.description} ${page.keywords ?? ''}`.toLocaleLowerCase('th');
          return haystack.includes(normalized);
        }),
      })).filter((group) => group.pages.length > 0),
    [normalized],
  );

  const total = groups.reduce((sum, group) => sum + group.pages.length, 0);

  return (
    <div className={styles.directory}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อหน้า คำสำคัญ หรือหมวด เช่น น้ำ ราคา จังหวัด"
            aria-label="ค้นหาหน้าทั้งหมด"
          />
          {query && (
            <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="ล้างคำค้น">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <span className={styles.count}>
          {normalized ? `พบ ${total} หน้า` : `ทั้งหมด ${PAGES.length} หน้า`}
        </span>
      </div>

      {!normalized && (
        <nav className={styles.jumpBar} aria-label="ข้ามไปหมวด">
          {PAGE_GROUPS.map((group) => (
            <a key={group.id} href={`#group-${group.id}`} className={styles.jumpLink}>
              <Icon name={group.icon} size={14} />
              {group.label}
            </a>
          ))}
        </nav>
      )}

      {groups.length === 0 && (
        <div className={styles.empty}>
          <Icon name="search" size={26} />
          <p>ไม่พบหน้าที่ตรงกับ “{query}”</p>
          <button type="button" className="button secondary" onClick={() => setQuery('')}>ล้างคำค้น</button>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.id} id={`group-${group.id}`} className={styles.group}>
          <div className={styles.groupHead}>
            <span className={styles.groupIcon}><Icon name={group.icon} size={19} /></span>
            <div className={styles.groupTitle}>
              <h2>{group.label}</h2>
              <p>{group.description}</p>
            </div>
            <span className={styles.groupCount}>{group.pages.length} หน้า</span>
          </div>
          <div className={styles.pageGrid}>
            {group.pages.map((page) => (
              <Link key={page.key} href={page.href} className={styles.pageCard}>
                <span className={styles.pageIcon}><Icon name={page.icon} size={18} /></span>
                <span className={styles.pageText}>
                  <strong>{page.label}</strong>
                  <span>{page.description}</span>
                  <small>{page.href}</small>
                </span>
                <Icon name="arrow" size={15} className={styles.pageArrow} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
