import Link from 'next/link';
import { Shell } from '@/components/shell';
import { WeatherDashboard } from '@/components/weather-dashboard';
import { WeatherObservationsPanel } from '@/components/weather-observations-panel';
import { REGION_BY_PROVINCE, REGIONS } from '@/lib/hub/weather-data';
import { readWeatherSnapshot, type WeatherSnapshot } from '@/lib/hub/weather-repository';
import { getProvinces } from '@/lib/provinces';

export const metadata = {
  title: 'สภาพอากาศเพื่อการเกษตร',
  description:
    'ค่าตรวจวัดจริงจากสถานีตรวจอากาศกรมอุตุนิยมวิทยา พร้อมดัชนีฝนสะสมเทียบค่าเฉลี่ยปกติและคำเตือนเพื่อการเกษตร รายภาคและรายจังหวัด; พยากรณ์กริดที่อนุมัติแล้ว (TMD HPC NWP 72 ชั่วโมง) แยกอยู่ที่หน้า /nwp',
};

// ตัวเลขจากสถานีเปลี่ยนตามรอบ sync ของคลังข้อมูลกลาง จึงห้ามเก็บหน้านี้ไว้ใน shared cache
export const dynamic = 'force-dynamic';

type Params = { province?: string };

export default async function WeatherPage({ searchParams }: { searchParams: Promise<Params> }) {
  const provinces = await getProvinces();
  const rows = provinces.map((province) => {
    const region = REGION_BY_PROVINCE[province.code];
    const label = REGIONS.find((row) => row.key === region)?.label ?? '';
    return { code: province.code, name: province.name, region, regionLabel: label };
  });

  // กรองจังหวัดจาก query เท่านั้น และต้องเป็นรหัสที่อยู่ในทะเบียน 77 รหัสจริง
  const { province } = await searchParams;
  const provinceCode = province && /^\d{2}$/.test(province) && provinces.some((row) => row.code === province)
    ? province
    : null;

  // สัญญาด้านข้อมูลเหมือนฝั่ง API route: อ่านไม่สำเร็จ ≠ ไม่มีข้อมูล จึงแยก state จาก payload=null
  let snapshot: WeatherSnapshot | null = null;
  let databaseRead = false;
  try {
    snapshot = await readWeatherSnapshot({ provinceCode });
    databaseRead = true;
  } catch (error) {
    console.warn('[weather] page read failed', error instanceof Error ? error.message : String(error));
  }

  return <Shell active="weather">
    <div className="page-heading">
      <div>
        <h1>สภาพอากาศเพื่อการเกษตร</h1>
        <p>
          ค่าตรวจวัดจริงจากสถานีอากาศเกษตรและสถานี synoptic ของกรมอุตุนิยมวิทยา เรียงตามวันตรวจวัดเดียวต่อหนึ่งครั้ง
          พยากรณ์รายสถานี 7 วันยังไม่มี batch ที่อนุมัติให้เผยแพร่ แต่พยากรณ์กริด TMD HPC NWP 72 ชั่วโมงที่อนุมัติแล้วดูได้ที่หน้า /nwp
          เลือกดูสถานีได้รายภาคและรายจังหวัด
        </p>
        <p>
          <Link className="text-link" href="/monthly-rainfall">ดูยอดฝนรายเดือนต่อสถานีที่ /monthly-rainfall</Link>
          {' '}— คนละเกรนกับตารางรายวันนี้ (สถานี × เดือน)
        </p>
      </div>
    </div>
    <WeatherObservationsPanel
      payload={snapshot?.payload ?? null}
      batches={snapshot?.batches ?? []}
      databaseRead={databaseRead}
      provinceCode={provinceCode}
    />
    <WeatherDashboard regions={REGIONS.map((row) => ({ ...row }))} provinces={rows}/>
    <p className="area-note">
      รหัสจังหวัด 77 รายการเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด
      ตารางด้านบนเป็นค่ารายสถานี จังหวัดที่ปรากฏคือจังหวัดที่ลงทะเบียนของสถานีนั้น ไม่ใช่ค่าที่เฉลี่ยจากหลายสถานี
      พยากรณ์รายสถานี 7 วันยังไม่มี batch ที่อนุมัติ; พยากรณ์กริด TMD HPC NWP 72 ชั่วโมง (อนุมัติแล้ว) อยู่ที่หน้า /nwp
    </p>
  </Shell>;
}
