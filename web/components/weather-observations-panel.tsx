import type {
  WeatherMetricId,
  WeatherObservationsPayload,
  WeatherStationRecord,
} from '@/lib/hub/weather-observations-data';
import {
  WEATHER_METRIC_PRESENTATION,
  WEATHER_METRICS,
  WEATHER_OBSERVATIONS_SOURCE,
} from '@/lib/hub/weather-observations-data';
import type { WeatherBatchProvenance } from '@/lib/hub/weather-repository';
import { Icon } from './icon';
import styles from './weather-observations-panel.module.css';

/**
 * Real station observations for `/weather`.
 *
 * The repository already applied the publication gates, so this component only
 * renders what D1 published and adds nothing: no province average, no unit
 * claim (`observations.unit` stays NULL until TMD confirms units in writing),
 * and no merge of several observation dates. It is a Server Component, so the
 * payload never becomes client state, and the demo forecast keeps its own
 * `sample: true` block in `WeatherDashboard`.
 */

interface PanelProps {
  payload: WeatherObservationsPayload | null;
  batches: WeatherBatchProvenance[];
  /** False only when the warehouse read itself failed, which is not "no data". */
  databaseRead: boolean;
  provinceCode: string | null;
}

function valueLabel(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits }).format(value);
}

function runLabel(status: string | null): string {
  if (status === 'succeeded') return 'ครบถ้วน';
  if (status === 'partial') return 'บางส่วน';
  return status ?? 'ไม่ทราบสถานะรอบ';
}

export function WeatherObservationsPanel({ payload, batches, databaseRead, provinceCode }: PanelProps) {
  return (
    <section className="local-data" aria-label="ข้อมูลตรวจวัดจริงจากสถานีตรวจอากาศ">
      <div className="real-data-heading">
        <div>
          <h2>ข้อมูลตรวจวัดจริงจากสถานีตรวจอากาศ</h2>
          <p>
            ค่าที่สถานีของกรมอุตุนิยมวิทยาวัดได้จริงและเผยแพร่จากคลังข้อมูลกลางแล้ว แสดงรายสถานีตามวันตรวจวัดเดียว
            ไม่ใช่ค่าระดับจังหวัด ไม่ใช่ค่าเฉลี่ยภาค และไม่ปะปนกับพยากรณ์ 7 วันด้านล่าง
          </p>
        </div>
        {payload
          ? <span className={styles.liveBadge}><Icon name="sun" size={13}/>ข้อมูลจริง · {payload.observationDate}</span>
          : <span className="badge pending"><Icon name="lock" size={13}/>ยังไม่เผยแพร่ตัวเลข</span>}
      </div>

      {!payload && <MetadataOnlyState databaseRead={databaseRead} batches={batches} provinceCode={provinceCode}/>}

      {payload && (
        <>
          <SummaryBlock payload={payload} provinceCode={provinceCode}/>
          <ProvinceChips stations={payload.stations} provinceCode={provinceCode}/>
          <UnitStatusNote payload={payload}/>
          <StationTable stations={payload.stations}/>
          <ReanalysisBlock payload={payload}/>
          <ProvenanceList batches={batches}/>
        </>
      )}

      <p className="data-notes">
        <strong>ที่มา:</strong> {WEATHER_OBSERVATIONS_SOURCE.attributionText} ·{' '}
        <a className="text-link" href="/api/v1/weather/observations">GET /api/v1/weather/observations</a>
        {' '}· grain: {WEATHER_OBSERVATIONS_SOURCE.grain} · ตรวจสิทธิ์ {WEATHER_OBSERVATIONS_SOURCE.licenseReviewedAt}
      </p>
    </section>
  );
}

function MetadataOnlyState({
  databaseRead,
  batches,
  provinceCode,
}: {
  databaseRead: boolean;
  batches: WeatherBatchProvenance[];
  provinceCode: string | null;
}) {
  return (
    <div className={styles.metadataOnly}>
      <h3>{provinceCode ? 'ยังไม่แสดงตัวเลขอากาศของจังหวัดนี้' : 'หน้านี้ยังไม่แสดงตัวเลขอากาศจากสถานี'}</h3>
      <p>
        {databaseRead
          ? provinceCode
            ? 'อ่านคลังข้อมูลกลางเรียบร้อยแล้ว แต่ไม่มีสถานีหรือจุดกริดของจังหวัดนี้ที่ผ่านเงื่อนไขการเผยแพร่ จึงไม่แสดงค่าของจังหวัดอื่นมาปน และค่าว่างไม่ใช่ 0 หรือ "ไม่มีฝน"'
            : 'อ่านคลังข้อมูลกลางเรียบร้อยแล้ว แต่ไม่พบแถวที่ผ่านเงื่อนไขการเผยแพร่ (resource เป็น approved_public และ active run ชนิด numeric) สำหรับทรัพยากรอากาศ'
          : 'เชื่อมต่อคลังข้อมูลกลางไม่สำเร็จ ซึ่งไม่ใช่ "ไม่มีข้อมูล" และไม่ใช่ "ไม่มีฝน" ระบบจึงไม่แสดงตัวเลขใด ๆ แทนค่าที่อ่านไม่ได้'}
      </p>
      {batches.length > 0 && (
        <p>batch ที่อ่านได้แต่ไม่มีค่าเผยแพร่: {batches.map((batch) => `${batch.network} (${batch.observationRows} แถว)`).join(', ')}</p>
      )}
      <ul>{WEATHER_OBSERVATIONS_SOURCE.limitations.map((line) => <li key={line}>{line}</li>)}</ul>
    </div>
  );
}

function SummaryBlock({ payload, provinceCode }: { payload: WeatherObservationsPayload; provinceCode: string | null }) {
  const { summary } = payload;
  const cards = [
    {
      label: 'สถานีที่รายงาน',
      value: valueLabel(summary.stationCount, 0),
      note: provinceCode ? 'จังหวัดที่กรองอยู่' : 'ทุกจังหวัดที่รายงานในวันนี้',
    },
    {
      label: 'จังหวัดที่มีสถานีรายงาน',
      value: valueLabel(summary.provincesWithReportingStation, 0),
      note: 'นับจากสถานี ไม่ใช่ข้ออ้างว่าครอบคลุม 77 จังหวัด',
    },
    { label: 'ร้อนที่สุด', ...extreme(summary.hottest, '°C') },
    { label: 'ต่ำที่สุด', ...extreme(summary.coolest, '°C') },
    { label: 'ฝนมากที่สุด', ...extreme(summary.wettest, 'มม.') },
    { label: 'ความชื้นสูงสุด', ...extreme(summary.mostHumid, '%') },
  ];
  return (
    <>
      <div className={styles.summaryGrid}>
        {cards.map((card) => (
          <div className={styles.summaryCard} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </div>
        ))}
      </div>
      <p className={styles.summaryFoot}>
        สถานีที่ส่งค่าฝนมา {valueLabel(summary.stationsReportingRainfall, 0)} สถานี
        {' '}· สถานีที่ต้นทางไม่ได้ส่งค่าฝน (ไม่ใช่ 0) {valueLabel(summary.stationsWithMissingRainfall, 0)} สถานี
        {' '}· เครือข่าย {summary.networks.join(', ')}
        {payload.otherObservationDates.length > 0
          && <> · วันตรวจวัดอื่นใน batch เดียวกันที่ไม่ได้นำมาบวกปน: {payload.otherObservationDates.join(', ')}</>}
      </p>
    </>
  );
}

function extreme(
  pick: WeatherObservationsPayload['summary']['hottest'],
  unit: string,
): { value: string; note: string } {
  if (!pick) return { value: '—', note: 'ยังไม่มีสถานีที่รายงานค่านี้' };
  return { value: `${valueLabel(pick.value)} ${unit}`, note: pick.stationNameTh ?? 'สถานี ' + pick.stationCode };
}

/**
 * Unit honesty line. `observations.unit` is NULL for every TMD measure until
 * the department confirms units in writing, so the page shows the provider's
 * own declared unit string as metadata and says plainly that it is unconfirmed.
 */
function UnitStatusNote({ payload }: { payload: WeatherObservationsPayload }) {
  const statuses = [...new Set(payload.stations.map((station) => station.unitStatus))].sort();
  const declared = WEATHER_METRICS
    .map((metric) => {
      const units = [...new Set(payload.stations.map((station) => station.declaredUnits[metric]).filter((unit): unit is string => Boolean(unit)))].sort();
      return { metric, units };
    })
    .filter((entry) => entry.units.length);
  if (!statuses.length) return null;
  return (
    <p className={styles.unitNote} id="weather-unit-note">
      <span className="badge pending"><Icon name="info" size={12}/>unit = null · {statuses.join(', ')}</span>
      {' '}ตัวเลขทั้งตารางคือค่าตามที่ต้นทางส่งมา ยังไม่มีการยืนยันหน่วยอย่างเป็นทางการจากกรมอุตุนิยมวิทยา{' '}
      {declared.length > 0 && (
        <>(หน่วยที่ payload ต้นทางระบุ: {declared.map((entry) => `${WEATHER_METRIC_PRESENTATION[entry.metric].labelTh} = ${entry.units.join(' หรือ ')}`).join(' · ')})</>
      )}
    </p>
  );
}

function ProvinceChips({ stations, provinceCode }: { stations: WeatherStationRecord[]; provinceCode: string | null }) {
  const seen = new Map<string, string>();
  for (const station of stations) {
    if (station.provinceCode && !seen.has(station.provinceCode)) {
      seen.set(station.provinceCode, station.provinceNameTh ?? station.provinceCode);
    }
  }
  if (!seen.size) return null;
  const rows = [...seen.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  return (
    <nav className={styles.chips} aria-label="กรองตารางสถานีตามจังหวัดที่มีสถานีรายงาน">
      <a href="/weather" className={provinceCode ? undefined : styles.chipActive}>ทุกจังหวัด</a>
      {rows.map(([code, name]) => (
        <a key={code} href={'/weather?province=' + code} className={provinceCode === code ? styles.chipActive : undefined}>
          {name}
        </a>
      ))}
    </nav>
  );
}

function StationTable({ stations }: { stations: WeatherStationRecord[] }) {
  if (!stations.length) {
    return <p className={styles.empty}>ไม่มีสถานีที่ผ่านเกณฑ์เผยแพร่ในจังหวัดที่เลือก ค่าว่างไม่ได้แปลว่าไม่มีฝน</p>;
  }
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">
          ค่าตรวจวัดรายสถานีของวันตรวจวัดที่แสดง หน่วยที่ระบุคือหน่วยที่ต้นทางประกาศ ยังรอการยืนยันอย่างเป็นทางการ
        </caption>
        <thead>
          <tr>
            <th scope="col">สถานี</th>
            <th scope="col">จังหวัด</th>
            <th scope="col">เครือข่าย</th>
            {WEATHER_METRICS.map((metric) => (
              <th key={metric} scope="col">
                {WEATHER_METRIC_PRESENTATION[metric].labelTh}
                <small className={styles.columnHeaderUnit}>{WEATHER_METRIC_PRESENTATION[metric].publishedUnit}</small>
              </th>
            ))}
            <th scope="col">ค่าที่รายงาน</th>
            <th scope="col">เวลาตรวจวัด (ICT)</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((station) => (
            <tr key={station.stationCode}>
              <th scope="row">
                <span className={styles.stationName}>{station.stationNameTh ?? station.stationCode}</span>
                <small>{station.stationCode}{station.stationNameEn ? ' · ' + station.stationNameEn : ''}</small>
              </th>
              <td>{station.provinceNameTh ?? <span className="null-value">ไม่ระบุจังหวัด</span>}</td>
              <td>{station.network}</td>
              {WEATHER_METRICS.map((metric) => (
                <td key={metric} className="numeric"><StationValue station={station} metric={metric}/></td>
              ))}
              <td
                className="numeric"
                title={station.missingMetricCount
                  ? `${station.missingMetricCount} ค่าที่ต้นทางส่งแถวมาแบบไม่มีค่า (missing) ไม่ใช่ 0`
                  : 'ทุกค่าที่ต้นทางส่งแถวมา มีตัวเลขใช้ได้อยู่ในตาราง'}
              >
                {station.reportedMetricCount}
                {station.missingMetricCount ? (
                  <small className={styles.columnHeaderUnit}>ขาด {station.missingMetricCount}</small>
                ) : null}
              </td>
              <td>{station.observedAtIct ?? <span className="null-value">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A null renders as an em dash, never as zero. `observations.unit` is NULL, so
 * the only unit text offered is the provider's own declaration, kept as a
 * tooltip rather than a claim on the number.
 */
function StationValue({ station, metric }: { station: WeatherStationRecord; metric: WeatherMetricId }) {
  const value = station.values[metric];
  const declared = station.declaredUnits[metric];
  if (value === null) return <span className="null-value">—</span>;
  return <span title={declared ? 'หน่วยตามที่ต้นทางระบุ: ' + declared : undefined}>{valueLabel(value)}</span>;
}

function ReanalysisBlock({ payload }: { payload: WeatherObservationsPayload }) {
  if (!payload.reanalysis.length) return null;
  return (
    <div className={styles.reanalysis}>
      <div className={styles.reanalysisHead}>
        <h3>ชุด reanalysis ERA5 รายวัน (ไม่ใช่ค่าตรวจวัด)</h3>
        <p>
          ค่าประมาณจากแบบจำลอง (dataKind=estimated) มีเฉพาะจังหวัดที่ถูกดึงเข้าคลังแล้ว
          ใช้ดูแนวโน้มย้อนหลังเทียบกันระหว่างวัน ไม่ใช่ตัวเลขจากสถานี และไม่วนไปรวมกับตารางด้านบน
        </p>
      </div>
      <div className="data-table-scroll">
        <table className="data-table">
          <caption className="sr-only">
            ค่า ERA5 รายวันของจังหวัดที่มีจุดกริดในคลังข้อมูล แสดงฝนสะสม 7 วันสุดท้ายเฉพาะกรณีที่ครบทั้งเจ็ดวัน
          </caption>
          <thead>
            <tr>
              <th scope="col">จังหวัด (จุดกริด)</th>
              <th scope="col">พิกัดกริด</th>
              <th scope="col">ช่วงวันที่ในคลัง</th>
              <th scope="col">จำนวนวัน</th>
              <th scope="col">ฝนสะสม 7 วันล่าสุด (มม.)</th>
              <th scope="col">ค่าที่ขาดหาย</th>
            </tr>
          </thead>
          <tbody>
            {payload.reanalysis.map((record) => {
              const last7 = record.days.slice(-7);
              const rainComplete = last7.length === 7 && last7.every((day) => day.precipMm !== null);
              const rainTotal = rainComplete
                ? last7.reduce((sum, day) => sum + (day.precipMm as number), 0)
                : null;
              const first = record.days[0]?.date ?? '—';
              const latest = record.days.at(-1)?.date ?? '—';
              return (
                <tr key={`${record.locationCode}|${record.provinceCode}`}>
                  <th scope="row">
                    <span className={styles.stationName}>{record.provinceNameTh ?? record.locationCode ?? 'ไม่ระบุ'}</span>
                    <small>{record.providerModel ?? 'era5'} · {record.dataKind}</small>
                  </th>
                  <td>{record.gridLatitude ?? '—'} / {record.gridLongitude ?? '—'}</td>
                  <td>{first} → {latest}</td>
                  <td className="numeric">{record.days.length}</td>
                  <td className="numeric">
                    {rainTotal === null
                      ? <span className="null-value" title="มีวันที่ต้นทางไม่ส่งค่าฝน จึงไม่วนบวกเป็นยอดสะสม">—</span>
                      : valueLabel(rainTotal)}
                  </td>
                  <td className="numeric">{record.missingValueCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProvenanceList({ batches }: { batches: WeatherBatchProvenance[] }) {
  if (!batches.length) return null;
  return (
    <div className={styles.provenance}>
      <h3>ที่มาของตัวเลขแต่ละก้อนในรอบนี้</h3>
      <ul>
        {batches.map((batch) => (
          <li key={batch.resourceUrl}>
            <strong>{batch.label}</strong>
            {' '}· {batch.network} · {batch.observationRows} แถว · สถานะรอบ {runLabel(batch.runStatus)}
            {' '}· retrieves {batch.sourceRetrievedAt ?? 'ไม่ระบุ'}
            {batch.adapterVersion ? ' · adapter ' + batch.adapterVersion : ''}
            {batch.payloadSha256 ? ' · sha256 ' + batch.payloadSha256.slice(0, 12) : ''}
            {batch.runId ? ' · run ' + batch.runId : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
