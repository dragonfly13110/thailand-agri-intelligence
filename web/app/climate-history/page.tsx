import { Shell } from '@/components/shell';
import { ClimateHistoryDashboard } from '@/components/climate-history-dashboard';
import { ClimateHistoryChirpsSample } from '@/components/climate-history-chirps-sample';
import { getProvinces } from '@/lib/provinces';

export const metadata = {
  title: 'ประวัติภูมิอากาศย้อนหลังเพื่อการเกษตร',
  description:
    'ข้อมูลภูมิอากาศย้อนหลัง ERA5 รายจุดกริด (ฝน/Tmax รายวัน 10-20 ปี) พร้อมขอบเขตการอ่านจริงและสถานะสิทธิ์ CC BY 4.0',
};

export default async function ClimateHistoryPage() {
  const provinces = await getProvinces();
  const rows = provinces.map((province) => ({ code: province.code, name: province.name }));

  return <Shell active="climate-history">
    <div className="page-heading">
      <div>
        <h1>ประวัติภูมิอากาศย้อนหลังและการเปลี่ยนแปลงสภาพอากาศ</h1>
        <p>สำรวจแนวโน้มอุณหภูมิ วันคลื่นความร้อน (Tmax สูงกว่า 38 °C) และปีฝนแล้ง-ฝนทิ้งช่วงจากข้อมูล ERA5 จริง รายจุดกริดของจังหวัดที่เลือก ช่วง 10-20 ปี เพื่อวางแผนเพาะปลูกและบริหารความเสี่ยงระยะยาว</p>
      </div>
    </div>
    <ClimateHistoryDashboard provinces={rows}/>
    <ClimateHistoryChirpsSample/>
    <p className="area-note">
      ตอนนี้ข้อมูลจริงที่อ่านได้มีสองระดับ: (1) numeric run ของ ERA5 ที่เผยแพร่ใน D1 ซึ่งขณะนี้มี 42 แถวรายวันของจังหวัดนครปฐม (รหัส 73) ช่วง 13–19 ต.ค. 2026 เท่านั้น
      และ (2) snapshot ERA5 รายจุดที่ ingest ดึงมาตรวจสอบแล้ว 5 จุดภูมิภาค (นครปฐม เชียงใหม่ ขอนแก่น อุบลราชธานี สุราษฎร์ธานี) ครบปฏิทินปี 2016–2025
      ทุกค่าที่แสดงเป็นค่าของ<strong>จุดกริดเดียว</strong> (0.25° ≈ 27 กม.) ไม่ใช่อุณหภูมิ/ฝนเฉลี่ยทั้งจังหวัดและไม่ใช่ค่าจากสถานีวัด
      {' '}รายชื่อ 77 จังหวัดเป็นทะเบียนพิกัด ไม่ใช่หลักฐาน coverage · CHIRPS ที่เผยแพร่มี 3 grid cells ของวันเดียว ใช้เป็น annex ตรวจสอบ pipeline เท่านั้น
      {' · '}แหล่งข้อมูล: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo ERA5 archive</a> (CC BY 4.0)
      และ <a href="https://www.chc.ucsb.edu/data/chirps" target="_blank" rel="noreferrer">CHIRPS v3.0</a> (Climate Hazards Center, UC Santa Barbara)
    </p>
  </Shell>;
}
