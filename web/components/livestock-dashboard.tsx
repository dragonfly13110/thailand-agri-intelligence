'use client';

import { useMemo, useState } from 'react';
import { Icon } from './icon';
import styles from './livestock-dashboard.module.css';

/**
 * แดชบอร์ด "สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ" สำหรับหน้า /livestock
 *
 * หมายเหตุเรื่องสัญญาข้อมูล: โมดูลต้นทาง `@/lib/hub/livestock-data` เป็น `server-only`
 * ฝั่ง client จึงประกาศชนิดข้อมูลซ้ำในไฟล์นี้ (แบบเดียวกับ weather-dashboard.tsx)
 * ชื่อชนิดและชื่อฟิลด์ต้องตรงกับที่หน้า server ส่ง prop `payload` เป๊ะ ๆ
 *
 * หลักความจริงของข้อมูล:
 * - ชนิดปศุสัตว์ของกรมปศุสัตว์ (ที่อนุมัติสิทธิ์แล้ว) มีตัวเลขจริงเมื่อ readState = 'real'
 *   ถ้า readState เป็น 'empty'/'unavailable' หน้าจอแสดงข้อความอธิบายสถานะ ไม่ใส่ค่าตัวอย่างแทน
 * - ชนิดสัตว์น้ำของกรมประมงยัง pending จึงเป็นค่าตัวอย่าง (readState = 'sample') พร้อมป้ายกำกับ
 * - ค่าที่ไม่ทราบแสดงเป็น "ไม่ทราบ" เสมอ ห้ามแปลง null เป็น 0
 */

type SectorId = 'livestock' | 'aquaculture';
type AgencyId = 'dld' | 'dof';
type ReadState = 'real' | 'empty' | 'unavailable' | 'sample';

type RegionDef = {
  id: string;
  label: string;
  provinceCount: number | null;
  basis: 'source' | 'crosswalk';
};

type SpeciesDef = {
  id: string;
  label: string;
  sector: SectorId;
  agency: AgencyId;
  agencyLabel: string;
  sourceLabel: string;
  metricLabel: string;
  unit: string;
  grain: string;
  yearBeFrom: number;
  yearBeTo: number;
  yearBeLatest: number;
  provinceCount: number | null;
  recordCount: number | null;
  regionSourceLabel: string;
  sourceUrl: string;
  datasetUrl: string;
  resourceId: string;
  licenseStatus: 'pending' | 'metadata_only' | 'approved_public';
  availability: 'verified' | 'partial' | 'unverified';
  availabilityNote: string;
  unitCaution: string | null;
};

type RegionStat = {
  regionId: string;
  regionLabel: string;
  value: number | null;
  sharePct: number | null;
};

type ProvinceStat = {
  province: string;
  value: number | null;
};

type StoreProvenance = {
  runId: string;
  runStatus: string | null;
  adapterVersion: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  revisionId: string | null;
  rowCount: number;
};

type SpeciesSummary = {
  speciesId: string;
  total: number | null;
  unit: string | null;
  yearBe: number | null;
  provinceCount: number | null;
  regions: RegionStat[];
  topProvinces: ProvinceStat[];
  sample: boolean;
  readState: ReadState;
  note: string | null;
  provenance: StoreProvenance | null;
  availableYearsBe: number[];
};

type SectorPayload = {
  id: SectorId;
  label: string;
  agencyLabel: string;
  regionSourceLabel: string;
  regions: RegionDef[];
  species: Array<{ def: SpeciesDef; summary: SpeciesSummary }>;
};

type SourceRef = {
  agencyId: AgencyId;
  agencyLabel: string;
  datasetUrl: string;
  apiUrl: string;
  resourceId: string;
  licenseStatus: string;
  reviewOutcome: string;
  retrievedAt: string;
  note: string;
};

type DashboardPayload = {
  generatedAt: string;
  sample: boolean;
  sectors: SectorPayload[];
  sources: SourceRef[];
  warnings: string[];
  sourceNote: string;
  gaps: Array<{ title: string; detail: string; sourceUrl: string | null }>;
};

export interface LivestockDashboardProps {
  payload: DashboardPayload;
}

/** แถบป้ายสถานะสิทธิ์เผยแพร่ — คำนี้เป็น metadata ที่ตรวจสอบได้จริง ไม่ใช่ตัวเลขตัวอย่าง */
const LICENSE_LABEL: Record<string, string> = {
  pending: 'รอตรวจสิทธิ์เผยแพร่ (pending)',
  metadata_only: 'แสดงคำอธิบายเท่านั้น (metadata_only)',
  approved_public: 'อนุมัติให้เผยแพร่ (approved_public)',
};

const AVAILABILITY_LABEL: Record<string, string> = {
  verified: 'ตรวจสอบแล้ว',
  partial: 'ข้อมูลบางส่วน',
  unverified: 'ยังไม่ยืนยัน',
};

/** ป้ายสถานะที่มาของตัวเลขรายชนิด — ต้องสะท้อน readState ของคลัง ไม่ใช่ป้ายรวมของทั้งหน้า */
const READ_STATE_LABEL: Record<ReadState, string> = {
  real: 'ข้อมูลจริงจากคลัง',
  empty: 'ยังไม่มีตัวเลขในคลัง',
  unavailable: 'อ่านคลังไม่ได้',
  sample: 'ข้อมูลตัวอย่าง',
};

const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** ค่าที่ไม่ทราบต้องแสดงเป็น "ไม่ทราบ" เท่านั้น ห้ามแปลงเป็น 0 (หลักการ missing = null ของ Hub) */
function formatNumber(value: number | null): string {
  return value === null ? 'ไม่ทราบ' : numberFormat.format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? 'ไม่ทราบ' : percentFormat.format(value) + '%';
}

function formatDateTime(value: string): string {
  if (!value || Number.isNaN(Date.parse(value))) return value || 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

/** ป้ายบอกฐานของระบบภาค — DLD กับ DOF ใช้คนละระบบ จึงห้ามสลับหรือรวมกัน */
function basisLabel(basis: 'source' | 'crosswalk', agencyLabel: string): string {
  return basis === 'crosswalk' ? 'ภาคมาตรฐาน (crosswalk รหัสจังหวัด)' : 'ภาคตาม' + agencyLabel;
}

function basisShort(basis: 'source' | 'crosswalk', agencyLabel: string): string {
  return basis === 'crosswalk' ? 'crosswalk รหัสจังหวัด' : 'ตาม' + agencyLabel;
}

type RegionRow = {
  id: string;
  label: string;
  basis: 'source' | 'crosswalk';
  provinceCount: number | null;
  value: number | null;
  sharePct: number | null;
};

export function LivestockDashboard({ payload }: LivestockDashboardProps) {
  const [sectorId, setSectorId] = useState<SectorId>(payload.sectors[0]?.id ?? 'livestock');
  const [speciesId, setSpeciesId] = useState<string>(payload.sectors[0]?.species[0]?.def.id ?? '');
  const [regionId, setRegionId] = useState<string>('all');

  const sector = useMemo(
    () => payload.sectors.find((item) => item.id === sectorId) ?? payload.sectors[0],
    [payload.sectors, sectorId],
  );

  const entry = useMemo(
    () => sector?.species.find((item) => item.def.id === speciesId) ?? sector?.species[0],
    [sector, speciesId],
  );

  /**
   * ฐานของระบบภาคของชนิดที่เลือก
   * ชนิดหนึ่งใช้ระบบภาคของหน่วยงานต้นทาง (source) อีกชนิดใช้ crosswalk รหัสจังหวัด
   * ตัดจาก regionSourceLabel ของชนิดก่อน แล้วค่อยเช็กกับชุดภาคของหน่วยงานเป็นตัวสำรอง
   */
  const basis = useMemo<'source' | 'crosswalk'>(() => {
    if (!entry || !sector) return 'source';
    if (/crosswalk/i.test(entry.def.regionSourceLabel)) return 'crosswalk';
    const matched = sector.regions.filter((row) => entry.summary.regions.some((stat) => stat.regionId === row.id));
    const bases = new Set(matched.map((row) => row.basis));
    return bases.size === 1 ? matched[0].basis : 'source';
  }, [entry, sector]);

  /**
   * รายการภาคของชนิดที่เลือก — ดึงจาก summary ของชนิดนั้นเอง (ไม่ใช่จากทุกชนิดของหน่วยงาน)
   * เพื่อไม่ให้ระบบภาคของกรมปศุสัตว์ปนกับระบบภาคของกรมประมงหรือ crosswalk
   */
  const regionRows = useMemo<RegionRow[]>(() => {
    if (!entry || !sector) return [];
    const stats = entry.summary.regions;
    if (!stats.length) {
      return sector.regions
        .filter((row) => row.basis === basis)
        .map((row) => ({ id: row.id, label: row.label, basis: row.basis, provinceCount: row.provinceCount, value: null, sharePct: null }));
    }
    return stats.map((stat) => {
      const def =
        sector.regions.find((row) => row.id === stat.regionId && row.basis === basis) ??
        sector.regions.find((row) => row.id === stat.regionId && row.label === stat.regionLabel) ??
        sector.regions.find((row) => row.id === stat.regionId);
      return {
        id: stat.regionId,
        label: stat.regionLabel || def?.label || stat.regionId,
        basis: def?.basis ?? basis,
        provinceCount: def?.provinceCount ?? null,
        value: stat.value,
        sharePct: stat.sharePct,
      };
    });
  }, [entry, sector, basis]);

  if (!sector || !entry) return null;

  const def = entry.def;
  const summary = entry.summary;
  const isSample = summary.sample;
  const isReal = summary.readState === 'real';
  const hasStoreNumbers = summary.readState === 'real' || summary.readState === 'empty' || summary.readState === 'unavailable';
  const unit = summary.unit ?? 'ไม่ทราบหน่วย';

  const selectSector = (nextId: SectorId) => {
    setSectorId(nextId);
    const next = payload.sectors.find((item) => item.id === nextId);
    setSpeciesId(next?.species[0]?.def.id ?? '');
    setRegionId('all');
  };

  const selectSpecies = (nextId: string) => {
    setSpeciesId(nextId);
    setRegionId('all');
  };

  const metrics = [
    {
      label: 'ยอดรวมทั้งประเทศ',
      value: hasStoreNumbers && !isReal ? '—' : formatNumber(summary.total),
      unit: isReal || isSample ? unit : '',
      foot: `${def.sourceLabel} · ${def.metricLabel}`,
    },
    {
      label: 'จังหวัดที่มีข้อมูล',
      value: hasStoreNumbers && !isReal ? '—' : formatNumber(summary.provinceCount),
      unit: 'จังหวัด',
      foot: `เกณฑ์ข้อมูล: ${def.grain}`,
    },
    {
      label: 'ปีข้อมูล (พ.ศ.)',
      value: hasStoreNumbers && !isReal ? '—' : formatNumber(summary.yearBe),
      unit: '',
      foot: summary.availableYearsBe.length > 0
        ? `ปีในคลัง: ${summary.availableYearsBe.join(', ')}`
        : `ช่วงข้อมูลที่มี ${def.yearBeFrom}–${def.yearBeTo} · ล่าสุด ${def.yearBeLatest}`,
    },
    {
      label: isReal ? 'แถวในคลัง (run อนุมัติ)' : 'ระเบียนต้นทาง',
      value: isReal ? formatNumber(summary.provenance?.rowCount ?? null) : formatNumber(def.recordCount),
      unit: 'แถว',
      foot: `resource: ${def.resourceId}`,
    },
  ];

  return (
    <div className={styles.container}>
      {/* แบนเนอร์สถานะที่มาของตัวเลข — ต้องอยู่เหนือตัวเลขทุกส่วนของหน้าจอ */}
      <section className={styles.sampleBanner} aria-label="สถานะที่มาของข้อมูล">
        <span className={styles.sampleBannerIcon}>
          <Icon name="info" size={20} />
        </span>
        <div className={styles.sampleBannerBody}>
          {isReal ? (
            <>
              <strong>ข้อมูลจริงจากคลังข้อมูลกลาง — ทรัพยากรที่ทะเบียนสิทธิ์อนุมัติแล้ว</strong>
              <p>
                ตัวเลขชุดนี้อ่านจาก observations ของ run ที่อนุมัติในคลังกลางเท่านั้น
                แสดงตามป้ายปี พ.ศ. ต้นทาง (ยังไม่ยืนยันปีปฏิทิน/ปีงบประมาณ)
                {summary.note ? ` · หมายเหตุ: ${summary.note}` : ''}
              </p>
            </>
          ) : summary.readState === 'empty' ? (
            <>
              <strong>ยังไม่มีตัวเลขในคลังข้อมูลกลางสำหรับชนิดนี้</strong>
              <p>{summary.note ?? 'ทรัพยากรได้รับสิทธิ์แล้ว แต่ยังไม่มีแถวตัวเลขที่เผยแพร่ หน้าจอจึงไม่แสดงตัวเลขและไม่ใช้ค่าตัวอย่างแทน'}</p>
            </>
          ) : summary.readState === 'unavailable' ? (
            <>
              <strong>อ่านคลังข้อมูลกลางไม่สำเร็จสำหรับชนิดนี้</strong>
              <p>{summary.note ?? 'ไม่สามารถยืนยันสถานะคลังข้อมูลได้ในขณะนี้ จึงไม่แสดงตัวเลขและไม่ใช้ค่าตัวอย่างแทน'}</p>
            </>
          ) : (
            <>
              <strong>ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ — ยังไม่ใช่ตัวเลขจริง</strong>
              <p>
                ตัวเลขของชนิดนี้เป็นค่าสาธิตแบบกำหนดผลลัพธ์ (deterministic demo) เพราะสิทธิ์การเผยแพร่ของทรัพยากรต้นทางยังอยู่ระหว่างตรวจสอบ
                ส่วนข้อมูลเมทาดาท้ายหน้า (grain, หน่วย, ปี, จำนวนระเบียน, สิทธิ์) เป็นค่าที่ตรวจสอบได้จริง
              </p>
            </>
          )}
          {payload.warnings.length > 0 && (
            <ol className={styles.warningList}>
              {payload.warnings.map((warning, index) => (
                <li key={index + '-' + warning}>{warning}</li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* แท็บหมวด: ปศุสัตว์ / สัตว์น้ำเศรษฐกิจ */}
      <div className={styles.tabBar} role="tablist" aria-label="เลือกหมวดปศุสัตว์และสัตว์น้ำเศรษฐกิจ">
        {payload.sectors.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={item.id === sector.id}
            className={`${styles.tab} ${item.id === sector.id ? styles.tabActive : ''}`}
            onClick={() => selectSector(item.id)}
            type="button"
          >
            <Icon name={item.id === 'aquaculture' ? 'fish' : 'animal'} size={16} />
            {item.label}
          </button>
        ))}
      </div>

      {/* เลือกชนิดสัตว์ */}
      <div className={styles.speciesRow} role="tablist" aria-label="เลือกชนิดสัตว์">
        {sector.species.map((item) => (
          <button
            key={item.def.id}
            role="tab"
            aria-selected={item.def.id === def.id}
            className={`${styles.speciesBtn} ${item.def.id === def.id ? styles.speciesBtnActive : ''}`}
            onClick={() => selectSpecies(item.def.id)}
            type="button"
          >
            {item.def.label}
          </button>
        ))}
      </div>

      {/* ตัวกรองภาค — ใช้เฉพาะภาคของชนิดที่เลือก ห้ามผสมสองระบบภาค */}
      <div className={styles.filterBar}>
        <div className={styles.filterField}>
          <label htmlFor="livestock-region">เลือกภาค</label>
          <select
            id="livestock-region"
            value={regionId}
            onChange={(event) => setRegionId(event.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            {regionRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.basisNote}>
          <Icon name="layers" size={15} />
          <span>
            ฐานข้อมูลภาค: <strong>{basisLabel(basis, sector.agencyLabel)}</strong>
            {/* ป้ายฐานภาคของชนิดอาจตรงกับข้อความข้างบนพอดี (เช่นชุดสัตว์น้ำจืดที่ใช้ crosswalk ทั้งคู่) จึงต้องกันไม่ให้ข้อความซ้ำ */}
            {def.regionSourceLabel && def.regionSourceLabel !== basisLabel(basis, sector.agencyLabel)
              ? ` · ${def.regionSourceLabel}`
              : ''}
          </span>
        </p>
      </div>

      {/* การ์ดตัวเลขหลัก */}
      <div className={styles.statGrid}>
        {metrics.map((metric) => (
          <div className={styles.statCard} key={metric.label}>
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{metric.label}</span>
              <span className={styles.sampleChip}>{READ_STATE_LABEL[summary.readState]}</span>
            </div>
            <div className={styles.statValue}>
              {metric.value}
              {metric.unit && <span className={styles.statUnit}>{metric.unit}</span>}
            </div>
            <span className={styles.statFoot}>{metric.foot}</span>
          </div>
        ))}
      </div>

      {/* กราฟ + ตารางภาค — ซ่อนเมื่อชนิดนี้ไม่มีตัวเลขในคลัง (empty/unavailable) ไม่วาดค่าสมมติ */}
      {hasStoreNumbers && !isReal ? (
        <section className={styles.card} aria-labelledby="livestock-share-heading">
          <div className={styles.cardHead}>
            <h3 id="livestock-share-heading">
              <Icon name="chart" size={18} /> สัดส่วนการเลี้ยงตามภาคและรายจังหวัด
            </h3>
            <p>{def.label} · {READ_STATE_LABEL[summary.readState]}</p>
          </div>
          <p className={styles.emptyNote}>
            {summary.note ?? 'ยังไม่มีตัวเลขจริงสำหรับชนิดนี้ จึงไม่แสดงกราฟและอันดับจังหวัด — ไม่ใช้ค่าตัวอย่างแทน'}
          </p>
        </section>
      ) : (
        <div className={styles.splitGrid}>
          <section className={styles.card} aria-labelledby="livestock-share-heading">
            <div className={styles.cardHead}>
              <h3 id="livestock-share-heading">
                <Icon name="chart" size={18} /> กราฟสัดส่วนการเลี้ยงตามภาค
              </h3>
              <p>
                {def.label} · หน่วย {unit} · {isSample ? 'ตัวเลขตัวอย่าง' : 'ตัวเลขจริง'} · {basisLabel(basis, sector.agencyLabel)}
              </p>
            </div>
            <ShareChart rows={regionRows} unit={unit} highlightId={regionId} speciesLabel={def.label} />
            <p className={styles.chartNote}>
              สัดส่วนคำนวณจากยอดรวมของ {def.label} ในปี พ.ศ. {formatNumber(summary.yearBe)} · ภาคที่ไม่มีค่าจะขึ้นว่า “ไม่ทราบ” ไม่ใช่ 0
              {summary.note ? ` · หมายเหตุ: ${summary.note}` : ''}
            </p>
          </section>

        <section className={styles.card} aria-labelledby="livestock-region-table-heading">
          <div className={styles.cardHead}>
            <h3 id="livestock-region-table-heading">
              <Icon name="catalog" size={18} /> รายละเอียดรายภาค
            </h3>
            <p>
              {basisLabel(basis, sector.agencyLabel)}
              {(() => {
                const detail = def.regionSourceLabel || sector.regionSourceLabel;
                return detail && detail !== basisLabel(basis, sector.agencyLabel) ? ` — ${detail}` : '';
              })()}
            </p>
          </div>
          <div className={styles.tableWrap} role="region" aria-label="ตารางรายละเอียดรายภาค" tabIndex={0}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th scope="col">ภาค</th>
                  <th scope="col">จำนวน ({unit})</th>
                  <th scope="col">สัดส่วน</th>
                  <th scope="col">จังหวัด</th>
                  <th scope="col">ฐานข้อมูลภาค</th>
                </tr>
              </thead>
              <tbody>
                {regionRows.map((row) => (
                  <tr key={row.id} className={regionId !== 'all' && regionId === row.id ? styles.rowActive : ''}>
                    <th scope="row">{row.label}</th>
                    <td className={styles.numeric}>{formatNumber(row.value)}</td>
                    <td className={styles.numeric}>{formatPercent(row.sharePct)}</td>
                    <td className={styles.numeric}>{formatNumber(row.provinceCount)}</td>
                    <td className={styles.basisCell}>{basisShort(row.basis, sector.agencyLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <p className={styles.chartNote}>
            ระบบภาคของ {sector.agencyLabel} และระบบภาคมาตรฐาน (crosswalk รหัสจังหวัด) เป็นคนละแกน จึงไม่นำมารวมหรือเทียบกัน
          </p>
        </section>
        </div>
      )}

      {/* จังหวัดเด่น + เมทาดาท้ายชนิด */}
      <div className={styles.splitGrid}>
        <section className={styles.card} aria-labelledby="livestock-top-provinces-heading">
          <div className={styles.cardHead}>
            <h3 id="livestock-top-provinces-heading">
              <Icon name="pin" size={18} /> จังหวัดที่มีจำนวนสูงสุด
            </h3>
            <p>{def.label} · หน่วย {unit}</p>
          </div>
          {hasStoreNumbers && !isReal ? (
            <p className={styles.emptyNote}>
              {summary.note ?? 'ยังไม่มีรายชื่อจังหวัดจริงสำหรับชนิดนี้ — ไม่ใช้ค่าตัวอย่างแทน'}
            </p>
          ) : summary.topProvinces.length > 0 ? (
            <ol className={styles.provinceList}>
              {summary.topProvinces.map((row, index) => (
                <li key={row.province}>
                  <span className={styles.provinceRank}>{index + 1}</span>
                  <span className={styles.provinceName}>{row.province}</span>
                  <span className={styles.provinceValue}>
                    {formatNumber(row.value)} {unit}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyNote}>ไม่ทราบ — ยังไม่มีรายชื่อจังหวัดสำหรับชนิดนี้</p>
          )}
          {isSample && <p className={styles.sampleHint}>รายชื่อและตัวเลขในส่วนนี้เป็นข้อมูลตัวอย่าง</p>}
        </section>

        <section className={styles.card} aria-labelledby="livestock-metadata-heading">
          <div className={styles.cardHead}>
            <h3 id="livestock-metadata-heading">
              <Icon name="catalog" size={18} /> ข้อมูลประกอบและการตรวจสอบ
            </h3>
            <p>ค่าส่วนนี้เป็น metadata ที่ตรวจสอบได้จริง ไม่ใช่ตัวเลขตัวอย่าง</p>
          </div>
          <dl className={styles.metaList}>
            <div>
              <dt>หน่วยงาน</dt>
              <dd>{def.agencyLabel}</dd>
            </div>
            <div>
              <dt>ชุดข้อมูลต้นทาง</dt>
              <dd>{def.sourceLabel}</dd>
            </div>
            <div>
              <dt>ตัวชี้วัด</dt>
              <dd>{def.metricLabel}</dd>
            </div>
            <div>
              <dt>เกณฑ์ข้อมูล (grain)</dt>
              <dd>{def.grain}</dd>
            </div>
            <div>
              <dt>หน่วย</dt>
              <dd>{def.unit}</dd>
            </div>
            <div>
              <dt>ช่วงปี (พ.ศ.)</dt>
              <dd>
                {def.yearBeFrom}–{def.yearBeTo} · ล่าสุด {def.yearBeLatest}
              </dd>
            </div>
            <div>
              <dt>จังหวัดที่มีข้อมูล</dt>
              <dd>{formatNumber(def.provinceCount)}</dd>
            </div>
            <div>
              <dt>ระเบียนต้นทาง</dt>
              <dd>{formatNumber(def.recordCount)}</dd>
            </div>
            <div>
              <dt>สถานะสิทธิ์เผยแพร่</dt>
              <dd>{LICENSE_LABEL[def.licenseStatus] ?? def.licenseStatus}</dd>
            </div>
            <div>
              <dt>สถานะตัวเลขในคลัง</dt>
              <dd>{READ_STATE_LABEL[summary.readState]}</dd>
            </div>
            {isReal && summary.provenance && (
              <>
                <div>
                  <dt>run ที่อนุมัติ</dt>
                  <dd>{summary.provenance.runId}{summary.provenance.runStatus ? ` (${summary.provenance.runStatus})` : ''}</dd>
                </div>
                <div>
                  <dt>adapter</dt>
                  <dd>{summary.provenance.adapterVersion ?? 'ไม่ทราบ'}</dd>
                </div>
                <div>
                  <dt>sha256 ของ payload</dt>
                  <dd>{summary.provenance.payloadSha256 ?? 'ไม่ทราบ'}</dd>
                </div>
                <div>
                  <dt>source revision</dt>
                  <dd>{summary.provenance.revisionId ?? 'ไม่ทราบ'}</dd>
                </div>
                <div>
                  <dt>ดึงข้อมูลต้นทางเมื่อ</dt>
                  <dd>{summary.provenance.sourceRetrievedAt ? formatDateTime(summary.provenance.sourceRetrievedAt) : 'ไม่ทราบ'}</dd>
                </div>
                <div>
                  <dt>แถวในคลัง</dt>
                  <dd>{formatNumber(summary.provenance.rowCount)}</dd>
                </div>
              </>
            )}
            <div>
              <dt>ความพร้อมของข้อมูล</dt>
              <dd>
                {AVAILABILITY_LABEL[def.availability] ?? def.availability} — {def.availabilityNote}
              </dd>
            </div>
          </dl>
          {def.unitCaution && (
            <p className={styles.caution}>
              <Icon name="info" size={15} /> {def.unitCaution}
            </p>
          )}
          <div className={styles.linkRow}>
            <a href={def.sourceUrl} target="_blank" rel="noreferrer noopener">
              <Icon name="external" size={14} /> เปิด API ต้นทาง
            </a>
            <a href={def.datasetUrl} target="_blank" rel="noreferrer noopener">
              <Icon name="external" size={14} /> เปิดหน้าชุดข้อมูล (CKAN)
            </a>
          </div>
        </section>
      </div>

      {/* ข้อจำกัดของข้อมูล */}
      <section className={styles.card} aria-labelledby="livestock-gaps-heading">
        <div className={styles.cardHead}>
          <h3 id="livestock-gaps-heading">
            <Icon name="info" size={18} /> ข้อจำกัดของข้อมูล
          </h3>
          <p>ข้อจำกัดที่ตรวจพบระหว่างเก็บ metadata จากหน่วยงานต้นทาง</p>
        </div>
        {payload.gaps.length > 0 ? (
          <ul className={styles.gapList}>
            {payload.gaps.map((gap) => (
              <li key={gap.title}>
                <strong>{gap.title}</strong>
                <p>{gap.detail}</p>
                {gap.sourceUrl && (
                  <a href={gap.sourceUrl} target="_blank" rel="noreferrer noopener">
                    <Icon name="external" size={13} /> ดูหลักฐานต้นทาง
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyNote}>ยังไม่มีข้อจำกัดที่บันทึกไว้</p>
        )}
      </section>

      {/* แหล่งอ้างอิง */}
      <section className={styles.card} aria-labelledby="livestock-sources-heading">
        <div className={styles.cardHead}>
          <h3 id="livestock-sources-heading">
            <Icon name="external" size={18} /> แหล่งอ้างอิง
          </h3>
          <p>ทุกลิงก์ชี้ไปยังหน้าชุดข้อมูล/API ของหน่วยงานต้นทาง เพื่อให้ตรวจซ้ำได้</p>
        </div>
        <ul className={styles.sourceList}>
          {payload.sources.map((source) => (
            <li key={source.agencyId + source.resourceId}>
              <div className={styles.sourceHead}>
                <h4>{source.agencyLabel}</h4>
                <span className={styles.sourceStatus}>{source.licenseStatus}</span>
              </div>
              <dl className={styles.sourceMeta}>
                <div>
                  <dt>resource id</dt>
                  <dd>{source.resourceId}</dd>
                </div>
                <div>
                  <dt>ผลการตรวจสอบ</dt>
                  <dd>{source.reviewOutcome}</dd>
                </div>
                <div>
                  <dt>ดึงข้อมูลเมื่อ</dt>
                  <dd>{formatDateTime(source.retrievedAt)}</dd>
                </div>
              </dl>
              {source.note && <p className={styles.sourceNoteText}>{source.note}</p>}
              <div className={styles.linkRow}>
                <a href={source.datasetUrl} target="_blank" rel="noreferrer noopener">
                  <Icon name="external" size={14} /> หน้าชุดข้อมูล
                </a>
                <a href={source.apiUrl} target="_blank" rel="noreferrer noopener">
                  <Icon name="external" size={14} /> API ต้นทาง
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.sourceNote}>
        <Icon name="info" size={15} />
        <span>
          {payload.sourceNote}
          <br />
          สร้างหน้าจอเมื่อ {formatDateTime(payload.generatedAt)}
        </span>
      </p>
    </div>
  );
}

/**
 * กราฟแท่งแนวนอน (inline SVG ไม่พึ่งไลบรารี)
 * - ภาคที่ตัวกรองเลือกไว้จะเน้น ส่วนภาคอื่นยังเห็นแต่จางลง ไม่ถูกซ่อน
 * - ค่าที่ไม่ทราบแสดงเป็น “ไม่ทราบ” และไม่วาดแท่งความยาวศูนย์
 */
function ShareChart({
  rows,
  unit,
  highlightId,
  speciesLabel,
}: {
  rows: RegionRow[];
  unit: string;
  highlightId: string;
  speciesLabel: string;
}) {
  if (!rows.length) {
    return <p className={styles.emptyNote}>ไม่ทราบ — ยังไม่มีข้อมูลรายภาคสำหรับชนิดนี้</p>;
  }

  // ความกว้าง viewBox เท่ากับความกว้างสูงสุดที่กราฟถูกเรนเดอร์ (1:1 บนเดสก์ท็อป)
  // เพื่อให้ขนาดตัวอักษรใน SVG ไม่เล็กลงมากเกินไปเมื่อจอแคบ
  const width = 460;
  const rowHeight = 68;
  const barHeight = 18;
  const height = rows.length * rowHeight + 8;

  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label={`กราฟสัดส่วนการเลี้ยง ${speciesLabel} แยกตามภาค หน่วย ${unit}`}
      >
        {rows.map((row, index) => {
          const y = index * rowHeight;
          const dimmed = highlightId !== 'all' && highlightId !== row.id;
          const share = row.sharePct === null ? null : Math.max(0, Math.min(100, row.sharePct));
          const barWidth = share === null ? 0 : (share / 100) * width;
          return (
            <g key={row.id} className={dimmed ? styles.chartRowDim : undefined}>
              <text x="0" y={y + 14} className={styles.chartLabel}>
                {row.label}
              </text>
              <text x={width} y={y + 14} textAnchor="end" className={styles.chartPercent}>
                {share === null ? 'ไม่ทราบ' : formatPercent(row.sharePct)}
              </text>
              <rect
                x="0"
                y={y + 22}
                width={width}
                height={barHeight}
                rx="4"
                className={share === null ? styles.chartTrackUnknown : styles.chartTrack}
              />
              {barWidth > 0 && (
                <rect x="0" y={y + 22} width={barWidth} height={barHeight} rx="4" className={styles.chartBar} />
              )}
              <text x={width} y={y + 58} textAnchor="end" className={styles.chartValue}>
                {formatNumber(row.value)} {unit}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className={styles.chartLegend}>
        <span>
          <i className={styles.legendBar} /> สัดส่วนของยอดรวมชนิดที่เลือก
        </span>
        <span>ความยาวแท่งเต็ม = 100% ของยอดรวม</span>
      </figcaption>
    </figure>
  );
}
