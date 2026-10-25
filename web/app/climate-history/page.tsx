import { Shell } from '@/components/shell';
import { ClimateHistoryDashboard } from '@/components/climate-history-dashboard';
import { getProvinces } from '@/lib/provinces';

export const metadata = {
  title: 'ประวัติภูมิอากาศย้อนหลังเพื่อการเกษตร',
  description:
    'แนวโน้มอุณหภูมิเฉลี่ย วันคลื่นความร้อน และปีฝนแล้ง-ฝนทิ้งช่วง ย้อนหลังรายจังหวัดเพื่อการวางแผนเพาะปลูกระยะยาว (ข้อมูลตัวอย่างรอตรวจสิทธิ์)',
};

export default async function ClimateHistoryPage() {
  const provinces = await getProvinces();
  const rows = provinces.map((province) => ({ code: province.code, name: province.name }));

  return <Shell active="climate-history">
    <div className="page-heading">
      <div>
        <h1>ประวัติภูมิอากาศย้อนหลังและการเปลี่ยนแปลงสภาพอากาศ</h1>
        <p>สำรวจแนวโน้มอุณหภูมิเฉลี่ย วันคลื่นความร้อน (Tmax สูงกว่า 38 °C) และปีฝนแล้ง-ฝนทิ้งช่วง ย้อนหลังรายจังหวัด 10-20 ปี เพื่อวางแผนเพาะปลูกและบริหารความเสี่ยงระยะยาว</p>
      </div>
    </div>
    <ClimateHistoryDashboard provinces={rows}/>
    <p className="area-note">
      ข้อมูลชุดนี้เป็นข้อมูลตัวอย่างจำลองจาก climatology ERA5/Open-Meteo ที่ยังรอตรวจสิทธิ์การเผยแพร่ ไม่ใช่ค่า reanalysis จริง
      ค่าระดับจังหวัดเป็นค่าจุดกริด (grid_point) ความละเอียด 0.25° หรือราว 27 กม. ไม่ใช่การวัดจากสถานีตรวจวัดอากาศจริง
      รหัสจังหวัด 77 รายการเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด
      {' · '}Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (สัญญาอนุญาต CC-BY-4.0)
    </p>
  </Shell>;
}
