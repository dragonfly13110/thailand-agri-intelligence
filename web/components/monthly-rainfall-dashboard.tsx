import Link from 'next/link';
import { Icon } from './icon';
import {
  MONTHLY_RAINFALL_METRICS,
  MONTHLY_RAINFALL_METRIC_PRESENTATION,
  MONTHLY_RAINFALL_SOURCE,
  THAI_MONTH_LABELS,
  type MonthlyRainfallBatch,
  type MonthlyRainfallDirectory,
  type MonthlyRainfallFilters,
  type MonthlyRainfallMetricId,
  type MonthlyRainfallPayload,
  type MonthlyRainfallStationRecord,
} from '@/lib/hub/weather-monthly-data';

/**
 * Station × month rainfall published in the hub, for `/monthly-rainfall`.
 *
 * This is a Server Component: the warehouse read happens in the page, every
 * control is a plain GET link or form, so a shared URL reproduces the same
 * selection without client state. The component adds nothing to the numbers —
 * no province average, no yearly total, no anomaly and no threshold, because
 * `observations.unit` is still NULL and the unit status is
 * `pending_official_confirmation`. A month the provider did not publish is left
 * out or drawn as a gap; it is never drawn as a zero.
 */

interface DashboardProps {
  payload: MonthlyRainfallPayload | null;
  batch: MonthlyRainfallBatch | null;
  directory: MonthlyRainfallDirectory | null;
  filters: MonthlyRainfallFilters;
  metric: MonthlyRainfallMetricId;
  /** True when the warehouse read itself failed, which is not "no data". */
  databaseRead: boolean;
}

function valueText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value);
}

function monthLabel(year: number, month: number): string {
  return THAI_MONTH_LABELS[month - 1] + ' ' + year;
}

function declaredUnit(station: MonthlyRainfallStationRecord, metric: MonthlyRainfallMetricId): string | null {
  return station.declaredUnits[metric] ?? null;
}

export function MonthlyRainfallDashboard({
  payload,
  batch,
  directory,
  filters,
  metric,
  databaseRead,
}: DashboardProps) {
  const state = !databaseRead ? 'unavailable' : !batch ? 'no_batch' : !payload ? 'filter_empty' : 'ready';
  const link = (overrides: Partial<MonthlyRainfallFilters> & { metric?: MonthlyRainfallMetricId }) => {
    const next = { ...filters, ...overrides };
    const query = new URLSearchParams();
    if (next.provinceCode) query.set('provinceCode', next.provinceCode);
    if (next.stationCode) query.set('stationCode', next.stationCode);
    if (next.year !== null) query.set('year', String(next.year));
    query.set('metric', overrides.metric ?? metric);
    const text = query.toString();
    return '/monthly-rainfall' + (text ? '?' + text : '');
  };

  return (
    <section className="local-data" aria-labelledby="monthly-rainfall-heading">
      <div className="real-data-heading">
        <div>
          <h2 id="monthly-rainfall-heading">ฝนรายเดือนจากสถานีตรวจอากาศ</h2>
          <p>
            ยอดรวมรายเดือนที่สถานีของกรมอุตุนิยมวิทยารายงานและเผยแพร่เข้าคลังข้อมูลกลางแล้ว เกรนข้อมูลคือ
            สถานี × เดือนปฏิทิน ไม่ใช่ค่าระดับจังหวัด และไม่รวมกับข้อมูลรายวันหรือค่ากริดแบบจำลอง
          </p>
        </div>
        {payload && batch
          ? <span className="badge neutral"><Icon name="water" size={13}/>ข้อมูลจริง · {payload.summary.stationCount} สถานี</span>
          : <span className="badge pending"><Icon name="lock" size={13}/>ยังไม่แสดงตัวเลข</span>}
      </div>

      <Filters directory={directory} filters={filters} metric={metric}/>

      {payload && <UnitStatusNote payload={payload}/>}
      {payload && <CoverageNote payload={payload} filters={filters} link={link}/>}

      {state === 'ready' && payload && (
        <>
          <MetricPicker metric={metric} link={link}/>
          {filters.stationCode
            ? <StationDetail station={payload.stations[0]} metric={metric} year={payload.year} link={link}/>
            : <StationRoster payload={payload} metric={metric} link={link}/>}
          {batch && <Provenance batch={batch} payload={payload}/>}
        </>
      )}

      {state !== 'ready' && (
        <UnavailableState state={state} directory={directory} filters={filters}/>
      )}

      <p className="data-notes">
        <strong>ที่มา:</strong> {MONTHLY_RAINFALL_SOURCE.attributionText} ·{' '}
        <a className="text-link" href={MONTHLY_RAINFALL_SOURCE.resourceUrl} target="_blank" rel="noreferrer">
          เอกสารทรัพยากรของ TMD<Icon name="external" size={15}/>
        </a>{' '}·{' '}
        <Link className="text-link" href="/api/v1/weather/monthly-rainfall">GET /api/v1/weather/monthly-rainfall</Link>{' '}
        · grain: {MONTHLY_RAINFALL_SOURCE.grain} · ตรวจสิทธิ์ {MONTHLY_RAINFALL_SOURCE.licenseReviewedAt}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every option comes from rows the hub actually published. A year, province or
 * station that is absent from the batch is never offered, because selecting it
 * would read as "no rain" instead of "no data".
 */
function Filters({
  directory,
  filters,
  metric,
}: {
  directory: MonthlyRainfallDirectory | null;
  filters: MonthlyRainfallFilters;
  metric: MonthlyRainfallMetricId;
}) {
  if (!directory) return null;
  const provinceCode = filters.provinceCode;
  const stations = provinceCode
    ? directory.stations.filter((station) => station.provinceCode === provinceCode)
    : directory.stations;
  return (
    <form className="data-filters" action="/monthly-rainfall" method="get">
      <div>
        <label htmlFor="rainfall-year">ปี ค.ศ. ที่มีข้อมูลในคลัง</label>
        <select id="rainfall-year" name="year" defaultValue={filters.year ?? ''}>
          <option value="">ทุกปีที่เผยแพร่ ({directory.years.length} ปี)</option>
          {directory.years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="rainfall-province">จังหวัดตามทะเบียนสถานี</label>
        <select id="rainfall-province" name="provinceCode" defaultValue={provinceCode ?? ''}>
          <option value="">ทุกจังหวัดที่มีสถานีรายงาน ({directory.provinces.length})</option>
          {directory.provinces.map((province) => (
            <option key={province.code ?? 'none'} value={province.code ?? ''}>
              {province.name ?? 'ไม่ระบุจังหวัด'}{province.code ? ' (' + province.code + ')' : ''} · {province.stationCount} สถานี
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rainfall-station">สถานี ({stations.length} รายการที่เลือกได้)</label>
        <select id="rainfall-station" name="stationCode" defaultValue={filters.stationCode ?? ''}>
          <option value="">ยังไม่เลือก — ดูรายชื่อสถานีทั้งจังหวัด</option>
          {stations.map((station) => (
            <option key={station.stationCode} value={station.stationCode}>
              {station.stationNameTh ?? station.stationCode} ({station.stationCode}) · {station.monthCount} เดือน
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="metric" value={metric}/>
      <button className="button" type="submit">ใช้ตัวกรอง<Icon name="search" size={16}/></button>
      {(provinceCode || filters.stationCode || filters.year !== null) && (
        <Link className="text-link" href="/monthly-rainfall">ล้างตัวกรอง</Link>
      )}
    </form>
  );
}

function MetricPicker({
  metric,
  link,
}: {
  metric: MonthlyRainfallMetricId;
  link: (overrides: Partial<MonthlyRainfallFilters> & { metric?: MonthlyRainfallMetricId }) => string;
}) {
  return (
    <nav className="data-count" aria-label="เลือกตัวชี้วัดของกราฟและคอลัมน์ที่เน้น">
      {MONTHLY_RAINFALL_METRICS.map((id) => (
        <Link key={id} href={link({ metric: id })} aria-current={id === metric ? 'true' : undefined}>
          {MONTHLY_RAINFALL_METRIC_PRESENTATION[id].labelTh}
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Unit honesty and coverage                                           */
/* ------------------------------------------------------------------ */

/**
 * `observations.unit` is NULL for every row of this resource, so the only unit
 * text on the page is the provider's own declaration, presented as metadata and
 * explicitly labelled as unconfirmed.
 */
function UnitStatusNote({ payload }: { payload: MonthlyRainfallPayload }) {
  const statuses = [...new Set(payload.stations.map((station) => station.unitStatus))].sort();
  const declared = MONTHLY_RAINFALL_METRICS
    .map((id) => ({
      id,
      units: [...new Set(payload.stations
        .map((station) => station.declaredUnits[id])
        .filter((unit): unit is string => Boolean(unit)))].sort(),
    }))
    .filter((entry) => entry.units.length);
  return (
    <p className="area-note" role="status">
      <span className="badge pending"><Icon name="info" size={12}/>unit = null · {statuses.join(', ') || 'ไม่ทราบสถานะ'}</span>{' '}
      ตัวเลขทั้งหน้าคือค่าตามที่ต้นทางส่งมา ยังไม่มีการยืนยันหน่วยอย่างเป็นทางการจากกรมอุตุนิยมวิทยา{' '}
      {declared.length > 0 && (
        <>· หน่วยที่ payload ต้นทางระบุเป็นข้อความประกอบเท่านั้น:{' '}
          {declared.map((entry) => `${MONTHLY_RAINFALL_METRIC_PRESENTATION[entry.id].labelTh} = ${entry.units.join(' หรือ ')}`).join(' · ')}</>
      )}
      {' '}· ระบบจึงไม่คำนวณเกณฑ์ภัยแล้ง ค่าผิดปกติ ค่าเฉลี่ยจังหวัด หรือยอดรวมปีจากหน่วยนี้
    </p>
  );
}

function CoverageNote({
  payload,
  filters,
  link,
}: {
  payload: MonthlyRainfallPayload;
  filters: MonthlyRainfallFilters;
  link: (overrides: Partial<MonthlyRainfallFilters> & { metric?: MonthlyRainfallMetricId }) => string;
}) {
  const { summary } = payload;
  return (
    <>
      <div className="data-count">
        <span>สถานีที่แสดง {summary.stationCount}</span>
        <span>จังหวัดที่มีสถานีรายงาน {summary.provincesWithReportingStation}</span>
        <span>ปีในชุดที่อ่านได้ {summary.years.join(', ')}</span>
        <span>เดือนที่มีข้อมูล {summary.monthsAvailable.map((month) => THAI_MONTH_LABELS[month - 1]).join(', ')}</span>
        <span>ค่าที่มีตัวเลข {summary.valueCount}</span>
        <span>ค่าที่ต้นทางไม่ส่งมา (ไม่ใช่ 0) {summary.missingValueCount}</span>
      </div>
      <p className="area-note">
        ตัวเลขข้างบนนับจากแถวที่เผยแพร่ได้จริงเท่านั้น จังหวัดที่มีสถานีรายงานไม่ใช่ coverage ทั้ง 77 จังหวัด
        และรหัส 77 จังหวัดเป็นทะเบียนอ้างอิงพื้นที่ ·{' '}
        {filters.provinceCode
          ? <>กำลังกรองจังหวัด {filters.provinceCode} · <Link className="text-link" href={link({ provinceCode: null, stationCode: null })}>ดูทุกจังหวัด</Link></>
          : 'ยังไม่กรองจังหวัด'}
        {filters.year !== null && <> · กรองปี {filters.year}{` `}
          <Link className="text-link" href={link({ year: null })}>ดูทุกปี</Link></>}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One station                                                         */
/* ------------------------------------------------------------------ */

/**
 * The months offered are exactly the rows that were published. When one year is
 * in play the twelve slots are drawn so an unpublished month is visible as a
 * gap; a month with no published row is never filled with a zero.
 */
function StationDetail({
  station,
  metric,
  year,
  link,
}: {
  station: MonthlyRainfallStationRecord;
  metric: MonthlyRainfallMetricId;
  year: number | null;
  link: (overrides: Partial<MonthlyRainfallFilters> & { metric?: MonthlyRainfallMetricId }) => string;
}) {
  const slots = buildSlots(station, year);
  return (
    <article className="pilot-section" aria-labelledby="station-detail-heading">
      <div className="real-data-heading">
        <div>
          <p className="pilot-source">
            สถานี {station.stationCode}{station.stationNameEn ? ' · ' + station.stationNameEn : ''}
            {' '}· {station.provinceNameTh ?? 'ไม่ระบุจังหวัดตามทะเบียนสถานี'}
            {station.provinceCode ? ' (รหัส ' + station.provinceCode + ')' : ''}
          </p>
          <h2 id="station-detail-heading">{station.stationNameTh ?? station.stationCode}</h2>
          <p>
            ค่ารายเดือนตามที่ต้นทางส่งมา {station.months.length} เดือน · มีตัวเลข {station.valueCount} ค่า ·
            ต้นทางส่งแถวมาแบบไม่มีค่า {station.missingValueCount} ค่า (แสดงเป็น — ไม่ใช่ 0)
          </p>
        </div>
        <Link className="text-link" href={link({ stationCode: null })}>กลับไปดูรายชื่อสถานี</Link>
      </div>
      <MonthChart station={station} metric={metric} slots={slots}/>
      <MonthTable station={station} slots={slots}/>
      <p className="area-note">
        {station.coordinateStatus === 'provider_field_order_suspect'
          ? 'พิกัดสถานีถูกเว้นไว้: ฟิลด์ละลอง/ลองจิจูดที่ต้นทางส่งมาเรียงสลับกัน ระบบจึงไม่แสดงพิกัดที่เดาแทน '
          : station.latitude !== null && station.longitude !== null
            ? <>พิกัดตามที่ต้นทางประกาศ <span className="pilot-coordinates">{station.latitude} / {station.longitude}</span> · </>
            : 'ต้นทางไม่ได้ส่งพิกัดของสถานีนี้ · '}
        เดือนที่ไม่อยู่ในตารางคือเดือนที่ต้นทางยังไม่ได้ปิดเดือนหรือไม่ได้รายงาน ไม่ใช่เดือนที่ไม่มีฝน
        และแถวของสถานีอื่นในเดือนเดียวกันไม่ถูกนำมาแทนค่าของสถานีนี้
      </p>
    </article>
  );
}

type MonthSlot = {
  year: number;
  month: number;
  present: boolean;
  values: Record<MonthlyRainfallMetricId, number | null> | null;
  periodStart: string | null;
  periodEnd: string | null;
};

function buildSlots(station: MonthlyRainfallStationRecord, year: number | null): MonthSlot[] {
  if (year === null) {
    return station.months.map((record) => ({
      year: record.year,
      month: record.month,
      present: true,
      values: record.values,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
    }));
  }
  const byMonth = new Map(station.months.filter((record) => record.year === year).map((record) => [record.month, record]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const record = byMonth.get(month);
    return {
      year,
      month,
      present: Boolean(record),
      values: record?.values ?? null,
      periodStart: record?.periodStart ?? null,
      periodEnd: record?.periodEnd ?? null,
    };
  });
}

function axisTop(peak: number): number {
  if (!(peak > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const step = magnitude / 2;
  return Math.ceil(peak / step) * step;
}

function MonthChart({
  station,
  metric,
  slots,
}: {
  station: MonthlyRainfallStationRecord;
  metric: MonthlyRainfallMetricId;
  slots: MonthSlot[];
}) {
  const values = slots.map((slot) => (slot.present ? slot.values?.[metric] ?? null : null));
  const peak = Math.max(0, ...values.filter((value): value is number => value !== null));
  const presentation = MONTHLY_RAINFALL_METRIC_PRESENTATION[metric];
  const declared = declaredUnit(station, metric);

  if (peak <= 0) {
    return <p className="area-note" role="status">
      สถานีนี้ยังไม่มีเดือนที่มีตัวเลขของ {presentation.labelTh} ในชุดที่อ่านได้ จึงไม่วาดกราฟ
      และการที่ไม่มีบาร์ไม่ได้แปลว่าค่าเป็น 0 หรือไม่มีฝน
    </p>;
  }

  const width = 760;
  const height = 260;
  const pad = { left: 58, right: 16, top: 20, bottom: 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const top = axisTop(peak);
  const band = innerWidth / Math.max(1, slots.length);
  const barWidth = Math.min(46, band * 0.62);
  const x = (index: number) => pad.left + band * (index + 0.5);
  const y = (value: number) => pad.top + innerHeight * (1 - value / top);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * top);

  return (
    <figure className="pilot-chart-scroll">
      <svg
        viewBox={'0 0 ' + width + ' ' + height}
        className="pilot-chart"
        role="img"
        aria-label={
          'กราฟค่า' + presentation.labelTh + 'รายเดือนของสถานี ' + (station.stationNameTh ?? station.stationCode) +
          ' (' + station.stationCode + ')' + (slots[0] ? ' ปี ' + slots[0].year : '') +
          ' แสดงเฉพาะเดือนที่ต้นทางปิดเดือนและเผยแพร่ และยังไม่ยืนยันหน่วยอย่างเป็นทางการ'
        }
      >
        <title>{presentation.labelTh}รายเดือนของสถานี {station.stationNameTh ?? station.stationCode}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="price-grid"/>
            <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end">{valueText(tick)}</text>
          </g>
        ))}
        <text x={pad.left - 10} y={pad.top - 6} textAnchor="end">{declared ? 'ตามที่ต้นทาง (' + declared + ')' : 'ค่าดิบ'}</text>
        {slots.map((slot, index) => {
          const value = slot.present ? slot.values?.[metric] ?? null : null;
          return (
            <g key={slot.year + '-' + slot.month}>
              <text x={x(index)} y={height - 14} textAnchor="middle">{THAI_MONTH_LABELS[slot.month - 1]}</text>
              {value === null ? (
                <text x={x(index)} y={y(0) - 6} textAnchor="middle" fillOpacity={0.65}>
                  {slot.present ? '—' : '–'}
                </text>
              ) : (
                <>
                  <rect
                    x={x(index) - barWidth / 2}
                    y={y(value)}
                    width={barWidth}
                    height={Math.max(1.5, y(0) - y(value))}
                    rx="2"
                    className="pilot-rain-bar"
                  >
                    <title>{monthLabel(slot.year, slot.month)}: {valueText(value)}{declared ? ' ' + declared + ' (หน่วยตามที่ต้นทางระบุ ยังไม่ยืนยัน)' : ''}</title>
                  </rect>
                  {/* a published zero is written as 0 so it is never mistaken for a gap */}
                  {value === 0 && <text x={x(index)} y={y(0) - 6} textAnchor="middle">0</text>}
                </>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="price-grid"/>
      </svg>
      <figcaption className="price-caption">
        แกนนอนคือเดือนปฏิทิน · เสาทึบคือเดือนที่มีตัวเลข และเลข 0 กำกับไว้ที่เดือนที่ต้นทางรายงานค่าเป็น 0 จริง
        · เครื่องหมาย — คือเดือนที่สถานีรายงานแต่ไม่มีค่า (ไม่ใช่ 0) · เครื่องหมาย – คือเดือนที่ไม่มีแถวเผยแพร่ ·{' '}
        แกนตั้งคือค่าดิบตามที่ต้นทางส่ง{declared ? ' ซึ่ง payload ระบุหน่วยว่า ' + declared : ''} ยังไม่มีการยืนยันหน่วยอย่างเป็นทางการ
      </figcaption>
    </figure>
  );
}

function MonthTable({
  station,
  slots,
}: {
  station: MonthlyRainfallStationRecord;
  slots: MonthSlot[];
}) {
  return (
    <div className="data-table-scroll pilot-month-table">
      <table className="data-table">
        <caption className="sr-only">
          ค่ารายเดือนของสถานี {station.stationCode} ตามที่เผยแพร่ในคลังข้อมูลกลาง หน่วยยังไม่ถูกยืนยันอย่างเป็นทางการ
        </caption>
        <thead>
          <tr>
            <th scope="col">เดือน</th>
            <th scope="col">ช่วงเวลาในคลัง</th>
            {MONTHLY_RAINFALL_METRICS.map((id) => (
              <th key={id} scope="col">
                {MONTHLY_RAINFALL_METRIC_PRESENTATION[id].labelTh}
                <small>{declaredUnit(station, id)
                  ? 'ตามที่แถวระบุ: ' + declaredUnit(station, id) + ' (ยังไม่ยืนยันอย่างเป็นทางการ)'
                  : 'unit = null · ยังไม่ยืนยัน'}</small>
              </th>
            ))}
            <th scope="col">สถานะเดือน</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.year + '-' + slot.month}>
              <th scope="row">{monthLabel(slot.year, slot.month)}</th>
              <td>{slot.present ? `${slot.periodStart ?? '—'} → ${slot.periodEnd ?? '—'}` : <span className="null-value">ไม่มีแถวเผยแพร่</span>}</td>
              {MONTHLY_RAINFALL_METRICS.map((id) => (
                <td key={id} className="numeric">
                  {slot.values && slot.values[id] !== null
                    ? <span title={declaredUnit(station, id) ? 'หน่วยตามที่ต้นทางระบุ: ' + declaredUnit(station, id) : undefined}>{valueText(slot.values[id])}</span>
                    : <span className="null-value">{slot.present ? '—' : '–'}</span>}
                </td>
              ))}
              <td>{slot.present ? 'ปิดเดือนแล้วตามแถวที่เผยแพร่' : 'ยังไม่แสดง (ไม่ใช่ 0)'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roster of readable stations                                         */
/* ------------------------------------------------------------------ */

function StationRoster({
  payload,
  metric,
  link,
}: {
  payload: MonthlyRainfallPayload;
  metric: MonthlyRainfallMetricId;
  link: (overrides: Partial<MonthlyRainfallFilters> & { metric?: MonthlyRainfallMetricId }) => string;
}) {
  return (
    <>
      <p className="price-subheading">เลือกสถานีเพื่อดูรายเดือน ({payload.stations.length} สถานีที่อ่านได้)</p>
      <div className="data-table-scroll pilot-production-table">
        <table className="data-table">
          <caption className="sr-only">
            รายชื่อสถานีที่มีแถวฝนรายเดือนเผยแพร่ พร้อมจำนวนเดือนที่เผยแพร่และจำนวนค่าที่ต้นทางไม่ได้ส่งมา
          </caption>
          <thead>
            <tr>
              <th scope="col">สถานี</th>
              <th scope="col">จังหวัดตามทะเบียนสถานี</th>
              <th scope="col">เดือนที่เผยแพร่</th>
              <th scope="col">ค่าที่มีตัวเลข / ไม่มีค่า</th>
              <th scope="col">ค่ามากสุดที่เห็นในสถานีนี้ ({MONTHLY_RAINFALL_METRIC_PRESENTATION[metric].labelTh})</th>
            </tr>
          </thead>
          <tbody>
            {payload.stations.map((station) => (
              <tr key={station.stationCode}>
                <th scope="row">
                  <Link href={link({ stationCode: station.stationCode })}>{station.stationNameTh ?? station.stationCode}</Link>
                  <small>{station.stationCode}</small>
                </th>
                <td>{station.provinceNameTh ?? <span className="null-value">ไม่ระบุจังหวัด</span>}</td>
                <td className="numeric">{station.months.length}</td>
                <td className="numeric">{station.valueCount} / <span className="null-value">{station.missingValueCount}</span></td>
                <td className="numeric">{stationPeak(station, metric)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="area-note">
        คอลัมน์สุดท้ายคือค่าสูงสุดที่เห็นในสถานีนั้นจากเดือนที่เผยแพร่ ใช้เทียบระหว่างสถานีคร่าว ๆ เท่านั้น
        ไม่ใช่ยอดรวมปี ไม่ใช่ค่าเฉลี่ยของจังหวัด และหน่วยยังรอการยืนยันอย่างเป็นทางการ
      </p>
    </>
  );
}

function stationPeak(station: MonthlyRainfallStationRecord, metric: MonthlyRainfallMetricId): string {
  let peak: number | null = null;
  for (const month of station.months) {
    const value = month.values[metric];
    if (value !== null && (peak === null || value > peak)) peak = value;
  }
  return valueText(peak);
}

/* ------------------------------------------------------------------ */
/* Provenance and honest empty states                                  */
/* ------------------------------------------------------------------ */

function Provenance({ batch, payload }: { batch: MonthlyRainfallBatch; payload: MonthlyRainfallPayload }) {
  const run = batch.runStatus === 'succeeded' ? 'ครบถ้วน' : batch.runStatus === 'partial' ? 'บางส่วน' : batch.runStatus ?? 'ไม่ทราบสถานะรอบ';
  return (
    <dl className="metadata-table">
      <div><dt>ช่วงเวลาที่แถวในคลังครอบคลุม</dt><dd>{batch.periodStart ?? 'ไม่ระบุ'} → {batch.periodEnd ?? 'ไม่ระบุ'}</dd></div>
      <div><dt>เวลาที่ต้นทางดึง (run)</dt><dd>{batch.sourceRetrievedAt ?? 'ไม่ระบุ'}</dd></div>
      <div><dt>เวลาสรุปผลรอบ</dt><dd>{batch.runCompletedAt ?? 'ไม่ระบุ'}</dd></div>
      <div><dt>เวอร์ชันชุดข้อมูล</dt><dd className="pilot-coordinates">{batch.payloadSha256 ? batch.payloadSha256.slice(0, 16) + '…' : batch.runId ?? 'ไม่ยืนยัน'}</dd></div>
      <div><dt>สถานะรอบข้อมูล</dt><dd>{run} · adapter {batch.adapterVersion ?? 'ไม่ระบุ'}</dd></div>
      <div><dt>จำนวนแถวที่อ่าน</dt><dd>{batch.collectedRows} แถว (จากที่คลังรายงาน {batch.reportedTotal} แถว · {batch.pages} หน้า)</dd></div>
      <div><dt>ปี/เดือนที่แสดง</dt><dd>{payload.summary.years.join(', ')} · เดือน {payload.summary.monthsAvailable.join(', ')}</dd></div>
    </dl>
  );
}

function UnavailableState({
  state,
  directory,
  filters,
}: {
  state: 'ready' | 'no_batch' | 'filter_empty' | 'unavailable';
  directory: MonthlyRainfallDirectory | null;
  filters: MonthlyRainfallFilters;
}) {
  const used = [
    filters.provinceCode ? 'provinceCode=' + filters.provinceCode : null,
    filters.stationCode ? 'stationCode=' + filters.stationCode : null,
    filters.year !== null ? 'year=' + filters.year : null,
  ].filter((part): part is string => Boolean(part));

  const title = state === 'unavailable'
    ? 'อ่านคลังข้อมูลกลางไม่สำเร็จ'
    : state === 'no_batch'
      ? 'ยังไม่มี batch ที่เผยแพร่ได้ของทรัพยากรนี้'
      : 'ไม่พบสถานี × เดือนที่ตรงกับตัวกรอง';

  const reason = state === 'unavailable'
    ? 'ระบบเชื่อมต่อคลังข้อมูลกลางไม่ได้ ซึ่งไม่ใช่ "ไม่มีข้อมูล" และไม่ใช่ "ไม่มีฝน" จึงไม่แสดงตัวเลขใด ๆ แทนค่าที่อ่านไม่ได้'
    : state === 'no_batch'
      ? 'อ่านคลังข้อมูลกลางสำเร็จ แต่ไม่พบแถวที่ผ่านเงื่อนไขการเผยแพร่ของทรัพยากร ThailandMonthlyRainfall (resource เป็น approved_public + project_publication_approved และมี active run ชนิด numeric)'
      : 'batch ที่เผยแพร่ได้อ่านได้ แต่ไม่มีแถวของตัวกรองนี้ จึงไม่แสดงตัวเลขของจังหวัดอื่นหรือปีอื่นมาปน';

  return (
    <div className="empty-state" role="status">
      <h3>{title}</h3>
      <p>{reason}</p>
      {used.length > 0 && <p>ตัวกรองที่ใช้: {used.join(' · ')}</p>}
      {state === 'filter_empty' && directory && (
        <p>
          เลือกได้: {directory.years.length} ปี ({directory.years.join(', ')}) · {directory.provinces.length} จังหวัด
          · {directory.stations.length} สถานี — ล้างตัวกรองเพื่อดูทั้ง batch
        </p>
      )}
      <ul>
        {MONTHLY_RAINFALL_SOURCE.limitations.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p>ยังไม่ได้แสดง: ตัวเลขรายเดือน · กราฟ · สรุปช่วงเวลาที่เลือก — ทั้งหมดต้องมีแถวที่เผยแพร่ได้จริงก่อน</p>
    </div>
  );
}
