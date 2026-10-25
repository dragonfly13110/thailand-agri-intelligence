'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CROP_STAGE_LABELS,
  MONTH_LABELS,
  type CropProfile,
  type CropStage,
  type CropTab,
} from '@/lib/hub/crops-soil-data';
import { Icon } from './icon';
import styles from './crops-dashboard.module.css';

interface CropsDashboardProps {
  tabs: CropTab[];
  sourceNote: string;
  statsSourceUrl?: string;
}

/** แถบเดือน 12 ช่อง: ไฮไลต์เดือนในช่วง range ของแต่ละระยะ */
function MonthBar({ stage }: { stage: CropStage }) {
  return (
    <div className={styles.monthBars}>
      {stage.ranges.map((range, index) => (
        <div className={styles.monthBarRow} key={range.label + index}>
          {range.season && <span className={styles.seasonTag}>{range.season}</span>}
          <div className={styles.monthCells} aria-hidden="true">
            {MONTH_LABELS.map((_, monthIndex) => {
              const active = range.months.includes(monthIndex + 1);
              return <span key={monthIndex} className={`${styles.monthCell} ${active ? styles.monthCellOn : ''}`} />;
            })}
          </div>
          <span className={styles.rangeLabel}>{range.label}</span>
        </div>
      ))}
    </div>
  );
}

export function CropsDashboard({ tabs, sourceNote, statsSourceUrl }: CropsDashboardProps) {
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id ?? '');
  const [activeProfileId, setActiveProfileId] = useState<string>(tabs[0]?.profiles[0]?.id ?? '');

  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);
  const activeProfile: CropProfile | undefined = useMemo(() => {
    if (!activeTab) return undefined;
    return activeTab.profiles.find(profile => profile.id === activeProfileId) ?? activeTab.profiles[0];
  }, [activeTab, activeProfileId]);

  if (!activeTab || !activeProfile) return null;

  const selectTab = (tabId: string) => {
    setActiveTabId(tabId);
    const firstProfile = tabs.find(tab => tab.id === tabId)?.profiles[0];
    setActiveProfileId(firstProfile?.id ?? '');
  };

  // สถิติพื้นที่/ผลผลิตถูกถอดออกจากหน้าเว็บและ API ระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำ
  return (
    <div className={styles.container}>
      {/* Crop Tabs */}
      <div className={styles.tabBar} role="tablist" aria-label="เลือกพืชเศรษฐกิจ">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTab.id}
            className={`${styles.tab} ${tab.id === activeTab.id ? styles.tabActive : ''}`}
            onClick={() => selectTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Season selector (only when a crop has multiple seasons, e.g. ข้าว) */}
      {activeTab.profiles.length > 1 && (
        <div className={styles.seasonRow} role="tablist" aria-label="เลือกฤดูปลูก">
          {activeTab.profiles.map(profile => (
            <button
              key={profile.id}
              role="tab"
              aria-selected={profile.id === activeProfile.id}
              className={`${styles.seasonBtn} ${profile.id === activeProfile.id ? styles.seasonBtnActive : ''}`}
              onClick={() => setActiveProfileId(profile.id)}
              type="button"
            >
              {profile.season ?? profile.name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.profileHead}>
        <div>
          <h2>{activeProfile.name}</h2>
          <p className={styles.profileDesc}>{activeProfile.description}</p>
        </div>
        <Link href="/soil" className={styles.soilLink}>
          <Icon name="layers" size={17} /> ดูคู่มือดินและปุ๋ยสำหรับพืชนี้ <Icon name="arrow" size={15} />
        </Link>
      </div>

      {/* Statistics are withheld pending licence review; show a traceable empty state instead of numbers. */}
      <section className={styles.withheldCard} role="status">
        <Icon name="info" size={22} />
        <div>
          <h3>ยังไม่แสดงสถิติพื้นที่และผลผลิต</h3>
          <p>
            ตัวเลขพื้นที่เพาะปลูก ผลผลิตรวม และผลผลิตต่อไร่ถูกถอดออกจากหน้าเว็บและ API ชั่วคราว
            ระหว่างตรวจสอบสิทธิ์การเผยแพร่ซ้ำจาก สศก. กรมการข้าว และกรมวิชาการเกษตร
            หน้านี้ยังคงแสดงปฏิทินการเพาะปลูกและสายพันธุ์ พร้อมลิงก์แหล่งอ้างอิงรายรายการ
          </p>
          {statsSourceUrl && (
            <a href={statsSourceUrl} target="_blank" rel="noreferrer noopener">
              ตรวจสอบเอกสารเผยแพร่ต้นทางของ สศก. <Icon name="external" size={12} />
            </a>
          )}
        </div>
      </section>

      {/* Crop Calendar */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3>
            <Icon name="chart" size={18} /> ปฏิทินการเพาะปลูก (Crop Calendar)
          </h3>
          {activeProfile.calendarNote && <p>{activeProfile.calendarNote}</p>}
        </div>
        <div className={styles.calendarTableWrap}>
          <table className={styles.calendarTable}>
            <thead>
              <tr>
                <th scope="col">ระยะการผลิต</th>
                <th scope="col">ช่วงเดือน</th>
                <th scope="col">12 เดือน</th>
              </tr>
            </thead>
            <tbody>
              {activeProfile.calendar.map(stage => (
                <tr key={stage.stage}>
                  <th scope="row" className={styles.stageCell}>
                    {CROP_STAGE_LABELS[stage.stage]}
                  </th>
                  <td className={styles.rangeText}>
                    {stage.ranges.map((range, index) => (
                      <span key={range.label + index}>
                        {index > 0 && <br />}
                        {range.season && <em className={styles.seasonInline}>{range.season}: </em>}
                        {range.label}
                      </span>
                    ))}
                  </td>
                  <td>
                    <MonthBar stage={stage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.monthLegend}>
          {MONTH_LABELS.map(label => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </section>

      {/* Varieties */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3>
            <Icon name="leaf" size={18} /> สายพันธุ์เด่นและคุณลักษณะ
          </h3>
          <p>คัดจากคลังพันธุ์/เอกสารวิชาการของหน่วยงานเจ้าของพันธุ์ ดู URL แต่ละพันธุ์เพื่อตรวจซ้ำ</p>
        </div>
        <div className={styles.varietyGrid}>
          {activeProfile.varieties.map(variety => (
            <article className={styles.varietyCard} key={variety.name}>
              <div className={styles.varietyHead}>
                <h4>{variety.name}</h4>
                <a
                  href={variety.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={variety.sourceName}
                  aria-label={'แหล่งอ้างอิง ' + variety.name}
                >
                  <Icon name="external" size={15} />
                </a>
              </div>
              <ul>
                {variety.traits.map(trait => (
                  <li key={trait}>{trait}</li>
                ))}
              </ul>
              <span className={styles.varietySource}>{variety.sourceName}</span>
            </article>
          ))}
        </div>
      </section>

      <p className={styles.sourceNote}>
        <Icon name="info" size={15} /> {sourceNote}
      </p>
    </div>
  );
}
