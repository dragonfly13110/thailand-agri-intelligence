import { Shell } from '@/components/shell';
import { WeatherDashboard } from '@/components/weather-dashboard';
import { REGION_BY_PROVINCE, REGIONS } from '@/lib/hub/weather-data';
import { getProvinces } from '@/lib/provinces';

export const metadata = {
  title: 'สภาพอากาศเพื่อการเกษตร',
  description: 'พยากรณ์อากาศ 7 วันล่วงหน้า ดัชนีฝนสะสมเทียบค่าเฉลี่ยปกติ และคำเตือนเพื่อการเกษตร รายภาคและรายจังหวัด',
};

export default async function WeatherPage() {
  const provinces = await getProvinces();
  const rows = provinces.map((province) => {
    const region = REGION_BY_PROVINCE[province.code];
    const label = REGIONS.find((row) => row.key === region)?.label ?? '';
    return { code: province.code, name: province.name, region, regionLabel: label };
  });

  return <Shell active="weather">
    <div className="page-heading">
      <div>
        <h1>สภาพอากาศเพื่อการเกษตร</h1>
        <p>พยากรณ์อากาศ 7 วันล่วงหน้า ดัชนีฝนสะสมเทียบค่าเฉลี่ยปกติ และคำเตือนสำหรับวางแผนเพาะปลูก เลือกได้ทั้งรายภาคและรายจังหวัด</p>
      </div>
    </div>
    <WeatherDashboard regions={REGIONS.map((row) => ({ ...row }))} provinces={rows}/>
    <p className="area-note">
      รหัสจังหวัด 77 รายการเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด
      ค่าพยากรณ์ระดับภาค/จังหวัดเป็นค่าประมาณเพื่อการวางแผน โปรดตรวจสอบประกาศเตือนภัยฉบับจริงจากหน่วยงานต้นทางก่อนตัดสินใจงานในแปลง
    </p>
  </Shell>;
}
