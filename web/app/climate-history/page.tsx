import { Shell } from '@/components/shell';
import { ClimateHistoryDashboard } from '@/components/climate-history-dashboard';
import { getProvinces } from '@/lib/provinces';

export const metadata = {
  title: 'ประวัติภูมิอากาศย้อนหลังเพื่อการเกษตร',
  description:
    'ข้อมูลภูมิอากาศย้อนหลังสำหรับการเกษตรจะเปิดเมื่อมีชุดข้อมูลที่ครอบคลุมช่วงเวลาและพื้นที่ตามคำขอ',
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
      ตอนนี้ยังไม่มี batch ERA5 ที่ครอบคลุมช่วง 10–20 ปีตามที่หน้านี้ต้องใช้ ส่วน CHIRPS มีเพียง 3 จุดกริดของวันเดียว จึงใช้คำนวณแนวโน้มระยะยาวหรือค่าเฉลี่ยรายจังหวัดไม่ได้
      ค่าที่ระดับจังหวัดจะเป็นข้อมูลจุดกริด (grid_point) ความละเอียด 0.25° ราว 27 กม. ไม่ใช่ค่าจากสถานีหรือค่าเฉลี่ยทั้งจังหวัด
      รายชื่อ 77 จังหวัดเป็นทะเบียนพื้นที่ ไม่ใช่หลักฐาน coverage
      {' · '}แหล่งข้อมูลที่วางแผนใช้: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo ERA5</a> (CC BY 4.0)
    </p>
  </Shell>;
}
