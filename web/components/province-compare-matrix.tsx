'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import type {
  CompareProvince,
  CompareShared,
  CropReference,
  Loadable,
  RainStatus,
  SoilSnapshot,
  WaterSnapshot,
  WeatherSnapshot,
} from '@/lib/province-compare';
import { formatNumber, formatPercent, formatThaiDate } from '@/lib/province-compare';
import { Icon } from './icon';
import styles from './province-compare-matrix.module.css';

/**
 * Presentational side-by-side comparison matrix for `/areas/compare`.
 *
 * This component formats the contract produced by the container; it never
 * fetches, ranks, or fills a missing value. Rows carry different grains:
 * rain/advisories are a province forecast view, water and soil are regional
 * references, and crops are a national reference shared by every selected
 * province. The caption and row notes repeat that so a shared number cannot be
 * read as a province value or a ranking.
 */

type Props = {
  rows: CompareProvince[];
  shared: CompareShared;
  onRetry?: () => void;
};

const RAIN_STATUS_LABEL: Record<RainStatus, string> = {
  below_normal: 'ฝนต่ำกว่าค่าเฉลี่ยปกติ',
  normal: 'ใกล้เคียงค่าเฉลี่ยปกติ',
  above_normal: 'ฝนสูงกว่าค่าเฉลี่ยปกติ',
  unknown: 'ยังประเมินไม่ได้',
};

const SEVERITY_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'เร่งด่วน',
  medium: 'ควรระวัง',
  low: 'ควรรู้',
};

const DEFAULT_SOIL_NOTE =
  'ชุดดินเป็นข้อมูลอ้างอิงระดับภาค ไม่ได้ระบุขอบเขตหรือรับรองความครอบคลุมรายจังหวัด';
const SAMPLE_RAIN_NOTE = 'ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ ยังไม่ใช่พยากรณ์จริง';

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'ไม่ทราบ';
  const formatted = formatPercent(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function withUnit(value: number | null, unit: string, digits = 1): string {
  if (value === null || Number.isNaN(value)) return 'ไม่ทราบ';
  return `${formatNumber(value, digits)} ${unit}`;
}

function soilCondition(item: SoilSnapshot['items'][number]): string {
  if (item.phNote.trim()) return `pH ${item.phNote}`;
  if (item.textureTop.trim()) return item.textureTop;
  return 'ไม่ทราบสภาพดิน';
}

function rainStatusClass(status: RainStatus): string {
  if (status === 'below_normal') return styles.statusBelow;
  if (status === 'above_normal') return styles.statusAbove;
  if (status === 'normal') return styles.statusNormal;
  return styles.statusUnknown;
}

function drySpellTone(severity: 'high' | 'medium' | 'low'): string {
  if (severity === 'high') return styles.drySpellHigh;
  if (severity === 'low') return styles.drySpellLow;
  return styles.drySpellMedium;
}

function SampleTag() {
  return <span className={`${styles.tag} ${styles.tagSample}`}>
    <Icon name="lock" size={11}/>ข้อมูลตัวอย่าง
  </span>;
}

function LoadingCell({ label }: { label: string }) {
  return <div className={styles.loadingCell}>
    <span className={styles.srOnly}>กำลังโหลด {label}</span>
    <span className={`${styles.skeletonBar} ${styles.barWide}`} aria-hidden="true"/>
    <span className={`${styles.skeletonBar} ${styles.barMid}`} aria-hidden="true"/>
    <span className={`${styles.skeletonBar} ${styles.barShort}`} aria-hidden="true"/>
  </div>;
}

function ErrorCell({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className={styles.cellError}>
    <p className={styles.errorMessage}><Icon name="info" size={14}/><span>{message}</span></p>
    {onRetry
      ? <button type="button" className={styles.retryButton} onClick={onRetry}>ลองอีกครั้ง</button>
      : null}
  </div>;
}

type CellFrameProps<T> = {
  loadable: Loadable<T>;
  label: string;
  onRetry?: () => void;
  colSpan?: number;
  className?: string;
  children: (data: T) => ReactNode;
};

function CellFrame<T>({ loadable, label, onRetry, colSpan, className, children }: CellFrameProps<T>) {
  const busy = loadable.phase === 'loading';
  return <td
    className={className ? `${styles.valueCell} ${className}` : styles.valueCell}
    colSpan={colSpan}
    aria-busy={busy ? true : undefined}
  >
    {loadable.phase === 'loading' && <LoadingCell label={label}/>}
    {loadable.phase === 'error' && <ErrorCell message={loadable.message} onRetry={onRetry}/>}
    {loadable.phase === 'ready' && children(loadable.data)}
  </td>;
}

function RainContent({ weather }: { weather: WeatherSnapshot }) {
  const cumulative = weather.cumulative;
  if (!cumulative) {
    return <div className={styles.cellStack}>
      {weather.sample ? <div className={styles.tagRow}><SampleTag/></div> : null}
      <p className={styles.emptyText}>ยังไม่มีข้อมูลฝนสะสมในช่วงพยากรณ์ 7 วัน</p>
    </div>;
  }

  return <div className={styles.cellStack}>
    <div className={styles.tagRow}>
      {weather.sample ? <SampleTag/> : null}
      <span className={`${styles.chip} ${rainStatusClass(cumulative.status)}`}>
        {RAIN_STATUS_LABEL[cumulative.status]}
      </span>
    </div>
    {cumulative.forecastTotalMm === null
      ? <p className={styles.heroMetric}><strong>ไม่ทราบ</strong></p>
      : <p className={styles.heroMetric}>
          <strong>{formatNumber(cumulative.forecastTotalMm)}</strong><span>มม.</span>
        </p>}
    <p className={styles.metricCaption}>
      ฝนสะสมช่วง {formatNumber(cumulative.windowDays, 0)} วัน
    </p>
    <dl className={styles.factList}>
      <div><dt>ค่าปกติ</dt><dd>{formatNumber(cumulative.normalTotalMm)} มม.</dd></div>
      <div><dt>ต่างจากค่าปกติ</dt><dd>{formatSignedPercent(cumulative.anomalyPercent)}</dd></div>
      <div><dt>วันแห้ง</dt><dd>{formatNumber(cumulative.dryDays, 0)} วัน</dd></div>
      <div><dt>วันฝนหนัก</dt><dd>{formatNumber(cumulative.heavyRainDays, 0)} วัน</dd></div>
    </dl>
    <p className={styles.completenessNote}>
      {cumulative.completeness === 'complete'
        ? <>ข้อมูลครบ {formatNumber(cumulative.daysWithData, 0)}/{formatNumber(cumulative.windowDays, 0)} วัน</>
        : <>ข้อมูล {formatNumber(cumulative.daysWithData, 0)}/{formatNumber(cumulative.windowDays, 0)} วัน
            {' · '}ขาด {formatNumber(cumulative.missingDays, 0)} วัน</>}
    </p>
    {weather.sample ? <p className={styles.sampleNote}>{SAMPLE_RAIN_NOTE}</p> : null}
  </div>;
}

function AdvisoryContent({ weather }: { weather: WeatherSnapshot }) {
  const cumulative = weather.cumulative;
  const status = cumulative?.status ?? 'unknown';
  const drySpell = weather.advisories.find((advisory) => advisory.code === 'DRY_SPELL');
  const others = weather.advisories.filter((advisory) => advisory.code !== 'DRY_SPELL');
  const visibleOthers = others.slice(0, 3);
  const remainingOthers = others.length - visibleOthers.length;

  return <div className={styles.cellStack}>
    <div className={styles.tagRow}>
      {weather.sample ? <SampleTag/> : null}
      <span className={`${styles.chip} ${rainStatusClass(status)}`}>{RAIN_STATUS_LABEL[status]}</span>
    </div>
    {cumulative
      ? <p className={styles.dryDaysLine}>
          วันแห้ง <strong>{formatNumber(cumulative.dryDays, 0)}</strong> วัน
          <span> · จากหน้าต่าง {formatNumber(cumulative.windowDays, 0)} วัน</span>
        </p>
      : <p className={styles.emptyText}>ไม่ทราบจำนวนวันแห้ง</p>}

    {drySpell
      ? <div className={`${styles.drySpell} ${drySpellTone(drySpell.severity)}`}>
          <span className={styles.drySpellLabel}>
            คำเตือนฝนทิ้งช่วง · {SEVERITY_LABEL[drySpell.severity]}
          </span>
          <p>{drySpell.titleTh}</p>
        </div>
      : null}

    {visibleOthers.length > 0
      ? <div className={styles.otherAdvisories}>
          <p className={styles.miniLabel}>คำเตือนอื่น ๆ</p>
          <ul className={styles.advisoryList}>
            {visibleOthers.map((advisory) => <li key={advisory.code}>
              <span className={styles.advisorySeverity}>{SEVERITY_LABEL[advisory.severity]}</span>
              {advisory.titleTh}
            </li>)}
          </ul>
          {remainingOthers > 0
            ? <p className={styles.moreNote}>และอีก {remainingOthers} รายการ</p>
            : null}
        </div>
      : null}

    {weather.advisories.length === 0
      ? <p className={styles.allClear}>
          <Icon name="sun" size={15}/><span>ไม่มีคำเตือนในช่วงพยากรณ์ 7 วัน</span>
        </p>
      : null}

    {weather.sample ? <p className={styles.sampleNote}>คำเตือนนี้มาจากข้อมูลตัวอย่าง</p> : null}
  </div>;
}

function WaterContent({ water }: { water: WaterSnapshot }) {
  if (water.grain === 'none') {
    return <div className={styles.cellStack}>
      <div className={styles.tagRow}>
        <span className={`${styles.tag} ${styles.tagNone}`}>ไม่พบข้อมูลระดับภาค</span>
      </div>
      <p className={styles.emptyStrong}>ไม่พบกลุ่มภาคตรงกัน</p>
      {water.note ? <p className={styles.cellNote}>{water.note}</p> : null}
      <a className={styles.cellLink} href="/water">
        ดูสถานการณ์น้ำ<Icon name="arrow" size={13}/>
      </a>
    </div>;
  }

  return <div className={styles.cellStack}>
    <div className={styles.tagRow}>
      <span className={`${styles.tag} ${styles.tagRegion}`}>ระดับภาค</span>
      {water.ridRegion ? <span className={styles.metaText}>{water.ridRegion}</span> : null}
    </div>
    <p className={styles.heroMetric}>
      <strong>{formatPercent(water.percent)}</strong>
      {water.percent !== null ? <span>ของความจุ</span> : null}
    </p>
    <dl className={styles.factList}>
      <div><dt>น้ำปัจจุบัน</dt><dd>{withUnit(water.volumeMcm, 'ล้าน ลบ.ม.')}</dd></div>
      <div><dt>ความจุรวม</dt><dd>{withUnit(water.storageMcm, 'ล้าน ลบ.ม.')}</dd></div>
      <div><dt>อ่างที่รายงาน</dt><dd>{withUnit(water.reservoirCount, 'อ่าง', 0)}</dd></div>
      <div><dt>วันที่รายงาน</dt><dd>{formatThaiDate(water.reportDate)}</dd></div>
    </dl>
    <p className={styles.cellNote}>
      ภาพรวมอ่างเก็บน้ำขนาดกลางระดับภาคจาก {water.sourceLabel}
      {' '}ไม่ใช่ค่าครอบคลุมหรือขอบเขตรายจังหวัด
    </p>
    <a className={styles.cellLink} href="/water">
      ดูสถานการณ์น้ำ<Icon name="arrow" size={13}/>
    </a>
  </div>;
}

function SoilContent({ soil }: { soil: SoilSnapshot }) {
  if (soil.scope === 'none') {
    return <div className={styles.cellStack}>
      <div className={styles.tagRow}>
        <span className={`${styles.tag} ${styles.tagNone}`}>ไม่พบข้อมูลระดับภาค</span>
      </div>
      <p className={styles.emptyStrong}>ยังไม่มีชุดดินภาคนี้ในคลังอ้างอิง</p>
      <p className={styles.cellNote}>{soil.note ?? DEFAULT_SOIL_NOTE}</p>
      <a className={styles.cellLink} href="/soil">
        ดูชุดดินอ้างอิง<Icon name="arrow" size={13}/>
      </a>
    </div>;
  }

  return <div className={styles.cellStack}>
    <div className={styles.tagRow}>
      <span className={`${styles.tag} ${styles.tagRegion}`}>ระดับภาค</span>
      {soil.regionLabel ? <span className={styles.metaText}>{soil.regionLabel}</span> : null}
    </div>
    {soil.items.length === 0
      ? <p className={styles.emptyText}>ยังไม่มีรายการชุดดินในภาคนี้</p>
      : <ul className={styles.soilList}>
          {soil.items.map((item) => <li className={styles.soilItem} key={item.id}>
            <span className={styles.soilCode}>{item.code}</span>
            <span className={styles.soilBody}>
              <span className={styles.soilName}>{item.name}</span>
              <span className={styles.soilMeta}>
                กลุ่มชุดดินที่ {formatNumber(item.groupNumber, 0)} · {soilCondition(item)}
              </span>
            </span>
          </li>)}
        </ul>}
    <p className={styles.cellNote}>{soil.note ?? DEFAULT_SOIL_NOTE}</p>
    <a className={styles.cellLink} href="/soil">
      ดูชุดดินอ้างอิง<Icon name="arrow" size={13}/>
    </a>
  </div>;
}

function CropsContent({ crops }: { crops: CropReference[] }) {
  return <div className={styles.cropsContent}>
    <div className={styles.tagRow}>
      <span className={`${styles.tag} ${styles.tagNational}`}>ระดับประเทศ</span>
    </div>
    <p className={styles.sharedNote}>
      API v1 ยังไม่มีข้อมูลพืชระดับจังหวัด แถวนี้จึงเป็นข้อมูลอ้างอิงร่วมของทุกจังหวัดที่เลือก
      ไม่ใช่ค่าของจังหวัดใดจังหวัดหนึ่ง และไม่ใช้จัดอันดับ
    </p>
    {crops.length === 0
      ? <p className={styles.emptyText}>ยังไม่มีรายการพืชอ้างอิงใน API v1</p>
      : <ul className={styles.cropList}>
          {crops.map((crop) => <li className={styles.cropChip} key={crop.id}>
            <span className={styles.cropLabel}>{crop.label}</span>
            {crop.profileNames.length > 0
              ? <span className={styles.cropProfiles}>{crop.profileNames.join(' · ')}</span>
              : null}
          </li>)}
        </ul>}
    <a className={styles.cellLink} href="/crops">
      ดูข้อมูลพืชทั้งหมด<Icon name="arrow" size={13}/>
    </a>
  </div>;
}

type ProvinceCellProps = {
  province: CompareProvince;
  onRetry?: () => void;
};

function RainCell({ province, onRetry }: ProvinceCellProps) {
  return <CellFrame
    loadable={province.weather}
    label={`ข้อมูลฝนสะสมของ${province.name}`}
    onRetry={onRetry}
  >
    {(weather) => <RainContent weather={weather}/>}
  </CellFrame>;
}

function AdvisoryCell({ province, onRetry }: ProvinceCellProps) {
  return <CellFrame
    loadable={province.weather}
    label={`คำเตือนและความเสี่ยงแล้งของ${province.name}`}
    onRetry={onRetry}
  >
    {(weather) => <AdvisoryContent weather={weather}/>}
  </CellFrame>;
}

function WaterCell({ province, onRetry }: ProvinceCellProps) {
  return <CellFrame
    loadable={province.water}
    label={`น้ำต้นทุนระดับภาคของ${province.name}`}
    onRetry={onRetry}
  >
    {(water) => <WaterContent water={water}/>}
  </CellFrame>;
}

function SoilCell({ province, onRetry }: ProvinceCellProps) {
  return <CellFrame
    loadable={province.soil}
    label={`ชุดดินระดับภาคของ${province.name}`}
    onRetry={onRetry}
  >
    {(soil) => <SoilContent soil={soil}/>}
  </CellFrame>;
}

function CropsCell({ shared, onRetry, colSpan }: {
  shared: CompareShared;
  onRetry?: () => void;
  colSpan: number;
}) {
  return <CellFrame
    loadable={shared.crops}
    label="พืชเศรษฐกิจอ้างอิงระดับประเทศ"
    onRetry={onRetry}
    colSpan={colSpan}
    className={styles.sharedCell}
  >
    {(crops) => <CropsContent crops={crops}/>}
  </CellFrame>;
}

export function ProvinceCompareMatrix({ rows, shared, onRetry }: Props) {
  const hintId = useId();

  if (rows.length === 0) {
    return <p className={styles.matrixEmpty}>เลือกจังหวัดอย่างน้อย 2 จังหวัดเพื่อเริ่มเปรียบเทียบ</p>;
  }

  const provinceNames = rows.map((row) => row.name).join(' กับ ');

  return <section className={styles.matrix} aria-label="ตารางเปรียบเทียบจังหวัด">
    <p className={styles.hint} id={hintId}>
      <Icon name="info" size={14}/>
      <span>
        <strong>เลื่อนตารางแนวนอนได้</strong> · กด Tab เพื่อโฟกัสกล่องตาราง แล้วใช้ปุ่มลูกศร
        {' '}· แต่ละแถวมีระดับข้อมูล (grain) ต่างกัน จึงไม่ใช่การจัดอันดับจังหวัด
      </span>
    </p>

    <div
      className={styles.scroll}
      role="region"
      aria-label={`ตารางเปรียบเทียบ ${provinceNames}`}
      aria-describedby={hintId}
      tabIndex={0}
    >
      <table className={styles.table} data-columns={rows.length}>
        <caption className={styles.srOnly}>
          ตารางเปรียบเทียบจังหวัดจาก API v1 เปรียบเทียบเฉพาะมิติที่มีใน API นี้:
          ฝนและคำเตือนเป็นค่าพยากรณ์รายจังหวัด น้ำต้นทุนและชุดดินเป็นข้อมูลอ้างอิงระดับภาค
          ส่วนพืชเป็นข้อมูลอ้างอิงระดับประเทศ แต่ละแถวจึงมีระดับข้อมูล (grain) ไม่เท่ากัน
          และตารางนี้ไม่ใช่การจัดอันดับจังหวัด
        </caption>
        <colgroup>
          <col className={styles.dimensionCol}/>
          {rows.map((province) => <col key={province.code}/>)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={`${styles.headerCell} ${styles.dimensionHeader}`}>
              <span className={styles.cornerTitle}>มิติเปรียบเทียบ</span>
              <span className={styles.cornerNote}>แถวต่างกันด้วยระดับข้อมูล</span>
            </th>
            {rows.map((province) => <th scope="col" className={styles.headerCell} key={province.code}>
              <span className={styles.provinceName}>{province.name}</span>
              <span className={styles.provinceMeta}>รหัส {province.code} · {province.regionLabel}</span>
              <a className={styles.headerLink} href={`/areas/${encodeURIComponent(province.code)}`}>
                ดูหน้าจังหวัด<Icon name="arrow" size={13}/>
              </a>
            </th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className={styles.dimensionCell}>
              <span className={styles.dimensionTitle}>
                ฝนสะสม 7 วัน <span className={styles.dimensionSub}>(ค่าพยากรณ์)</span>
              </span>
              <span className={styles.dimensionNote}>ค่าพยากรณ์และค่าปกติจาก API v1</span>
              <a className={styles.rowLink} href="/weather">
                หน้าสภาพอากาศ<Icon name="arrow" size={12}/>
              </a>
            </th>
            {rows.map((province) => <RainCell
              key={province.code}
              province={province}
              onRetry={onRetry}
            />)}
          </tr>

          <tr>
            <th scope="row" className={styles.dimensionCell}>
              <span className={styles.dimensionTitle}>ความเสี่ยงแล้ง / คำเตือน</span>
              <span className={styles.dimensionNote}>ตามสถานะฝนและคำเตือนจาก API เท่านั้น</span>
              <a className={styles.rowLink} href="/weather">
                คำเตือน 7 วัน<Icon name="arrow" size={12}/>
              </a>
            </th>
            {rows.map((province) => <AdvisoryCell
              key={province.code}
              province={province}
              onRetry={onRetry}
            />)}
          </tr>

          <tr>
            <th scope="row" className={styles.dimensionCell}>
              <span className={styles.dimensionTitle}>น้ำต้นทุนในภาค (RID)</span>
              <span className={styles.dimensionNote}>ภาพรวมระดับภาค ไม่ใช่ค่าของจังหวัด</span>
              <a className={styles.rowLink} href="/water">
                สถานการณ์น้ำ<Icon name="arrow" size={12}/>
              </a>
            </th>
            {rows.map((province) => <WaterCell
              key={province.code}
              province={province}
              onRetry={onRetry}
            />)}
          </tr>

          <tr>
            <th scope="row" className={styles.dimensionCell}>
              <span className={styles.dimensionTitle}>กลุ่มชุดดินเด่นในภาค (LDD)</span>
              <span className={styles.dimensionNote}>ชุดดินไม่ใช่ขอบเขตจังหวัด</span>
              <a className={styles.rowLink} href="/soil">
                ชุดดินอ้างอิง<Icon name="arrow" size={12}/>
              </a>
            </th>
            {rows.map((province) => <SoilCell
              key={province.code}
              province={province}
              onRetry={onRetry}
            />)}
          </tr>

          <tr>
            <th scope="row" className={styles.dimensionCell}>
              <span className={styles.dimensionTitle}>พืชเศรษฐกิจอ้างอิงระดับประเทศ</span>
              <span className={styles.dimensionNote}>ข้อมูลร่วมของทุกจังหวัด ไม่ใช่ค่าหรืออันดับรายจังหวัด</span>
            </th>
            <CropsCell shared={shared} onRetry={onRetry} colSpan={rows.length}/>
          </tr>
        </tbody>
      </table>
    </div>
  </section>;
}
