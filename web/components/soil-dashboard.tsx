'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fertilizerRowsForSoil,
  FERTILIZER_GUIDANCE,
  searchSoilSeries,
  SOIL_NOT_FOUND_NAMES,
  SOIL_PROBLEMS,
  SOIL_SEARCH_HINT,
  SOIL_SERIES,
  SOIL_SOURCE_NOTE,
  type FertilizerGuidance,
  type SoilSeries,
} from '@/lib/hub/crops-soil-data';
import { Icon } from './icon';
import styles from './soil-dashboard.module.css';

const TEXTURE_LABEL: Record<SoilSeries['textureClass'], string> = {
  clay: 'ดินเหนียว',
  loam: 'ดินร่วน',
  sandy: 'ดินทราย',
};

/** การ์ดชุดดินผลจากการค้นหา — กดเพื่อดูรายละเอียดด้านล่าง */
function SeriesCard({
  series,
  active,
  onSelect,
}: {
  series: SoilSeries;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.seriesCard} ${active ? styles.seriesCardActive : ''}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className={styles.seriesHead}>
        <strong>{series.name}</strong>
        <span className={styles.seriesCode}>{series.code}</span>
      </span>
      <span className={styles.seriesMeta}>
        กลุ่ม {series.groupNumber} · {series.region} · {TEXTURE_LABEL[series.textureClass]}
      </span>
      <span className={styles.seriesTexture}>{series.textureTop}</span>
      <span className={styles.seriesPh}>
        pH {series.phTop} / {series.phBottom} <em>{series.phNote}</em>
      </span>
    </button>
  );
}

export function SoilDashboard() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(SOIL_SERIES[0]?.id ?? '');
  const [cropId, setCropId] = useState<string>(FERTILIZER_GUIDANCE[0]?.cropId ?? '');

  const results = useMemo(() => searchSoilSeries(query), [query]);
  const selected = useMemo(
    () => results.find(series => series.id === selectedId) ?? results[0] ?? null,
    [results, selectedId],
  );
  const guidance: FertilizerGuidance | null = useMemo(
    () => FERTILIZER_GUIDANCE.find(item => item.cropId === cropId) ?? FERTILIZER_GUIDANCE[0] ?? null,
    [cropId],
  );
  const matchedRows = useMemo(
    () => (guidance && selected ? fertilizerRowsForSoil(guidance, selected) : []),
    [guidance, selected],
  );

  return (
    <div className={styles.container}>
      {/* Search */}
      <section className={styles.searchBox}>
        <label className={styles.searchLabel} htmlFor="soil-search">
          <Icon name="search" size={17} /> ค้นหากลุ่มชุดดิน (กรมพัฒนาที่ดิน)
        </label>
        <input
          id="soil-search"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="เช่น กำแพงแสน, นครปฐม, สีคิ้ว, Ks, กลุ่ม 36, ภาคเหนือ"
          className={styles.searchInput}
          autoComplete="off"
        />
        <p className={styles.searchHint}>{SOIL_SEARCH_HINT}</p>
        <p className={styles.searchCount} role="status">
          พบ {results.length} จาก {SOIL_SERIES.length} ชุดดินที่บันทึกในหน้านี้
        </p>
      </section>

      {/* Results grid */}
      {results.length > 0 ? (
        <div className={styles.seriesGrid}>
          {results.map(series => (
            <SeriesCard
              key={series.id}
              series={series}
              active={selected?.id === series.id}
              onSelect={() => setSelectedId(series.id)}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyBox}>
          <p>
            <strong>ไม่พบชุดดินที่ตรงกับ “{query}”</strong> ในชุดข้อมูลที่บันทึกไว้ ({SOIL_SERIES.length}{' '}
            ชุดดิน)
          </p>
          <p>
            ชื่อพื้นที่เหล่านี้ไม่มีในทะเบียนชุดดินที่ตรวจได้:{' '}
            {SOIL_NOT_FOUND_NAMES.map(name => (
              <code key={name}>{name}</code>
            ))}
          </p>
          <p className={styles.emptyCaution}>
            <Icon name="info" size={15} /> หนึ่งจังหวัดมีหลายชุดดิน หนึ่งชุดดินกระจายหลายจังหวัด —
            การไม่พบชื่อไม่ได้หมายความว่าพื้นที่นั้นไม่มีข้อมูลดิน ควรตรวจกับระบบสำรวจดินของ LDD
          </p>
        </div>
      )}

      {/* Detail */}
      {selected && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2>
                {selected.name} <span className={styles.codeBadge}>{selected.code}</span>
              </h2>
              <p>
                กลุ่มชุดดินที่ {selected.groupNumber} · {selected.region} · เนื้อดินหลัก:{' '}
                {TEXTURE_LABEL[selected.textureClass]}
              </p>
            </div>
            <a
              className={styles.sourceLink}
              href={selected.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {selected.sourceName} <Icon name="external" size={13} />
            </a>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>เนื้อดิน (ชั้นบน / ชั้นล่าง)</span>
              <p>
                {selected.textureTop}
                <br />
                <span className={styles.detailSub}>{selected.textureBottom}</span>
              </p>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>ค่า pH</span>
              <p>
                {selected.phTop} / {selected.phBottom}
                <br />
                <span className={styles.detailSub}>{selected.phNote}</span>
              </p>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>ความอุดมสมบูรณ์ (บน / ลึก)</span>
              <p>
                {selected.fertilityTop} / {selected.fertilityDeeper}
                <br />
                <span className={styles.detailSub}>{selected.fertilityNote}</span>
              </p>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>การแพร่กระจาย</span>
              <p>{selected.distribution}</p>
            </div>
          </div>

          {selected.problems.length > 0 && (
            <div className={styles.problemRow}>
              <span className={styles.detailLabel}>ปัญหาเด่น</span>
              <div className={styles.chipRow}>
                {selected.problems.map(problem => (
                  <span className={styles.problemChip} key={problem}>
                    {problem}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className={styles.searchTermNote}>
            คำค้นที่แมตช์ชุดดินนี้: {selected.searchTerms.join(', ')} — ใช้ระบุพื้นที่ตั้งชื่อตามชุดดิน
            ไม่ใช่ขอบเขตทั้งจังหวัด
          </p>
        </section>
      )}

      {/* Fertilizer */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2>
              <Icon name="leaf" size={19} /> ปุ๋ยแนะนำตามชนิดดินและพืช
            </h2>
            <p>
              {guidance?.basis}
              {selected ? ` — ไฮไลต์แถวที่แมตช์เนื้อดินของ${selected.name}` : ''}
            </p>
          </div>
          <a
            className={styles.sourceLink}
            href={guidance?.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            {guidance?.sourceName} <Icon name="external" size={13} />
          </a>
        </div>

        <div className={styles.cropChips} role="tablist" aria-label="เลือกพืช">
          {FERTILIZER_GUIDANCE.map(item => (
            <button
              key={item.cropId}
              type="button"
              role="tab"
              aria-selected={item.cropId === guidance?.cropId}
              className={`${styles.cropChip} ${item.cropId === guidance?.cropId ? styles.cropChipActive : ''}`}
              onClick={() => setCropId(item.cropId)}
            >
              {item.cropName}
            </button>
          ))}
        </div>

        {guidance && (
          <div className={styles.tableWrap}>
            <table className={styles.fertTable}>
              <thead>
                <tr>
                  <th scope="col">เงื่อนไข</th>
                  <th scope="col">คำแนะนำ (อัตรา กก./ไร่ หรือสูตรปุ๋ย)</th>
                </tr>
              </thead>
              <tbody>
                {guidance.rows.map((row, index) => (
                  <tr
                    key={row.condition}
                    className={matchedRows.includes(index) ? styles.rowMatch : undefined}
                  >
                    <th scope="row" className={styles.condCell}>
                      {row.condition}
                      {row.textureTags && (
                        <span className={styles.tagRow}>
                          {row.textureTags.map(tag => (
                            <span className={styles.textureTag} key={tag}>
                              {TEXTURE_LABEL[tag]}
                            </span>
                          ))}
                        </span>
                      )}
                    </th>
                    <td>
                      {row.recommendation}
                      {row.note && <span className={styles.rowNote}>{row.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {guidance?.timing && <p className={styles.timingNote}>ช่วงเวลาใส่: {guidance.timing}</p>}

        {guidance?.unverified && guidance.unverified.length > 0 && (
          <div className={styles.unverifiedBox}>
            <p>
              <Icon name="info" size={15} /> รายการที่ตรวจไม่พบหลักฐานราชการ (ไม่ใช้ในหน้านี้):
            </p>
            <ul>
              {guidance.unverified.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Soil problems */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2>
              <Icon name="info" size={19} /> การแก้ปัญหาดิน
            </h2>
            <p>อัตราและวิธีจากกรมส่งเสริมการเกษตร กรมพัฒนาที่ดิน — ดู URL แต่ละข้อเพื่อตรวจซ้ำ</p>
          </div>
        </div>
        <div className={styles.problemGrid}>
          {SOIL_PROBLEMS.map(problem => (
            <article className={styles.problemCard} key={problem.id}>
              <h3>{problem.title}</h3>
              <p className={styles.problemSummary}>{problem.summary}</p>
              <ul>
                {problem.guidance.map(item => (
                  <li key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={item.sourceName}
                    >
                      {item.sourceName} <Icon name="external" size={11} />
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <p className={styles.sourceNote}>
        <Icon name="info" size={15} /> {SOIL_SOURCE_NOTE}
      </p>

      <p className={styles.crossLink}>
        <Link href="/crops">
          ดูปฏิทินเพาะปลูก สถิติผลผลิต และสายพันธุ์พืชเศรษฐกิจ <Icon name="arrow" size={14} />
        </Link>
      </p>
    </div>
  );
}
