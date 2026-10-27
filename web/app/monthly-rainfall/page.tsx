import { Shell } from '@/components/shell';
import { MonthlyRainfallDashboard } from '@/components/monthly-rainfall-dashboard';
import {
  parseMonthlyRainfallFilters,
  readMonthlyRainfallSnapshot,
  type MonthlyRainfallSnapshot,
} from '@/lib/hub/monthly-rainfall-repository';
import {
  MONTHLY_RAINFALL_METRICS,
  MONTHLY_RAINFALL_SOURCE,
  type MonthlyRainfallFilters,
} from '@/lib/hub/weather-monthly-data';
import { isSupportedProvinceCode } from '@/lib/hub/province';

export const metadata = {
  title: 'ฝนรายเดือนจากสถานีจริง',
  description:
    'ปริมาณฝนและวันฝนตกสะสมรายเดือนของสถานีตรวจอากาศกรมอุตุนิยมวิทยา ที่เผยแพร่เข้าคลังข้อมูลกลางแล้ว ดูตามปี จังหวัด และสถานี พร้อมที่มาและสถานะหน่วย',
};

// แถวในคลังเปลี่ยนตามรอบ sync ของทรัพยากร จึงห้ามเก็บหน้านี้ไว้ใน shared cache
export const dynamic = 'force-dynamic';

type Params = { year?: string; provinceCode?: string; stationCode?: string; metric?: string };

const NO_READ: MonthlyRainfallSnapshot = { payload: null, batch: null, directory: null };
const NO_FILTERS: MonthlyRainfallFilters = { provinceCode: null, stationCode: null, year: null };

/**
 * Reuses the API's own validator by rebuilding the request URL from the page
 * query, so the page and `/api/v1/weather/monthly-rainfall` cannot drift into
 * two different filter parsers. A value the contract rejects is dropped and
 * reported as such, never repaired by guessing.
 */
async function readFilters(params: Params): Promise<{ filters: MonthlyRainfallFilters; rejected: string | null }> {
  const query = new URLSearchParams();
  for (const key of ['year', 'provinceCode', 'stationCode'] as const) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  if (!query.toString()) return { filters: NO_FILTERS, rejected: null };
  try {
    const filters = parseMonthlyRainfallFilters(new URL('http://hub.internal/monthly-rainfall?' + query.toString()));
    // A well-formed code that is not in the 77-province register filters nothing real.
    if (filters.provinceCode && !await isSupportedProvinceCode(filters.provinceCode)) {
      return { filters: { ...filters, provinceCode: null }, rejected: 'provinceCode=' + filters.provinceCode };
    }
    return { filters, rejected: null };
  } catch {
    return { filters: NO_FILTERS, rejected: query.toString() };
  }
}

export default async function MonthlyRainfallPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { filters, rejected } = await readFilters(params);

  // Same three states as the API route: unreadable warehouse, no published batch, numbers.
  let snapshot = NO_READ;
  let databaseRead = false;
  try {
    snapshot = await readMonthlyRainfallSnapshot(filters);
    databaseRead = true;
  } catch (error) {
    console.warn('[monthly-rainfall] page read failed', error instanceof Error ? error.message : String(error));
  }

  const metric = MONTHLY_RAINFALL_METRICS.find((id) => id === params.metric) ?? 'monthly_rainfall_mm';

  return <Shell active="weather">
    <div className="page-heading">
      <div>
        <h1>ฝนรายเดือนจากสถานีจริง</h1>
        <p>
          {MONTHLY_RAINFALL_SOURCE.description} — เกรนสถานี × เดือน ปฏิทิน
          แสดงเฉพาะเดือนที่ต้นทางปิดเดือนและเผยแพร่เข้าคลังข้อมูลกลางแล้ว อ่านที่มาและช่วงเวลาของแต่ละแถวได้ที่ท้ายหน้า
        </p>
      </div>
      <a className="button secondary" href="/api/v1/weather/monthly-rainfall?pageSize=100">เปิดข้อมูลรูป JSON ของ API</a>
    </div>

    {rejected && <p className="area-note" role="status">
      ตัวกรองใน URL ไม่ผ่านสัญญาของ API ({rejected}) ระบบจึงละตัวกรองนั้นและแสดงทั้ง batch ที่อ่านได้แทน
      รูปแบบที่ใช้ได้คือ year=ปี ค.ศ. 4 หลัก, provinceCode=รหัสจังหวัด 2 หลักในทะเบียน 77 จังหวัด, stationCode=รหัสสถานี
      และรหัสจังหวัดเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่าจังหวัดนั้นมีข้อมูล
    </p>}

    <MonthlyRainfallDashboard
      payload={snapshot.payload}
      batch={snapshot.batch}
      directory={snapshot.directory}
      filters={filters}
      metric={metric}
      databaseRead={databaseRead}
    />

    <p className="area-note">
      เกรนของหน้านี้คือสถานี × เดือน ค่าของสถานีหนึ่งไม่ใช่ค่าเฉลี่ยของจังหวัด และจังหวัดที่ไม่มีสถานีในชุดนี้
      ไม่ได้หมายความว่าไม่มีฝน · หน่วยที่แสดงเป็นหน่วยตามที่ payload ของต้นทางระบุ ยังไม่มีการยืนยันอย่างเป็นทางการ
      (unit=null, unit_status=pending_official_confirmation) · ดูค่าตรวจวัดรายวันที่ <a className="text-link" href="/weather">/weather</a>{' '}
      และค่ากริดพยากรณ์ที่ <a className="text-link" href="/nwp">/nwp</a> ซึ่งคนละเกรนกับหน้านี้
    </p>
  </Shell>;
}
