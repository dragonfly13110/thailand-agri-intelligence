# วิธีคำนวณและข้อจำกัด

สถานะ: รากฐานสำหรับทดสอบระบบตามสเปก v1.4 ยังไม่ใช่กฎที่ผ่านการรับรองหรือผลพยากรณ์สถานการณ์จริง ตัวเลขใน unit tests เป็นข้อมูลสังเคราะห์ทั้งหมด

## Decision API

`evaluate_water_risk(evidence)` และ `evaluate_market(evidence)` คืน evidence card มีสถานะ `unknown`, `normal`, `watch` พร้อมหลักฐาน เหตุผล รุ่นกฎ ผู้รับผิดชอบ และข้อเสนอให้ตรวจสอบ `automatic_action` เป็น `false` เสมอ

โครงสร้าง input:

```json
{
  "area_code": "10",
  "admin_level": "province",
  "commodity_id": "rice",
  "evaluated_at": "2026-10-22T00:00:00Z",
  "coverage": null,
  "observations": {}
}
```

แต่ละรายการใน `observations` ต้องมี `value`, `unit`, `source_id`, `source_url`, `definition`, `observed_at`, `release_at`, `area_code`, `admin_level` ตามความละเอียดจริงของข้อมูล วันที่แบบ `YYYY-MM-DD` หมายถึงเที่ยงคืน UTC ส่วน datetime ต้องมี timezone ข้อมูลขาดหรือไม่ตรงพื้นที่คืน `unknown` ไม่เติม 0 และไม่แจกค่าระดับจังหวัดให้ตำบล

กฎและอายุข้อมูลสูงสุดอยู่ใน `config/thresholds.json` ค่าเหล่านี้เป็นค่าเริ่มต้นเพื่อทดสอบ ไม่ใช่เกณฑ์ราชการ ค่า observed/release ในหลักฐานถูกเก็บกลับใน card ส่วน coverage ที่ไม่ทราบยังคงเป็น null

### เฝ้าระวังฝนต่ำกว่าฐานฤดูกาล

ใช้ `rain_percentile`, `ndvi_valid_fraction`, `water_level` ที่ตรวจแหล่งที่มาและความละเอียดพื้นที่แล้ว `rain_percentile` ต้องมี `reference_years` อย่างน้อย 5 ปี และสองตัวแรกใช้หน่วย `fraction` ช่วง 0 ถึง 1

ฝนต่ำกว่า percentile 0.20 ให้ `watch` เมื่อหลักฐานครบและภาพดาวเทียมมี valid fraction อย่างน้อย 0.70 ถ้าภาพใช้ไม่ได้หรือข้อมูลใดขาด/ล่าช้า คืน `unknown` ค่า 0 ยังเป็นค่าที่ใช้ได้จริง สถานะ `normal` หมายถึงไม่เข้าเงื่อนไขฝนต่ำตามกฎทดลอง ไม่ได้ยืนยันว่าไม่มีความเสี่ยงอื่น

ระดับน้ำใช้เป็นหลักฐานแนบให้เจ้าหน้าที่อ่าน ยังไม่มีเกณฑ์เทียบ datum หรือความต้องการน้ำพืช จึงเรียกสัญญาณว่า `low_rain_monitoring_candidate` ห้ามตีความเป็นผลประเมินสมดุลน้ำ ภัยแล้ง ความเสียหายพืช หรือคำสั่งให้จ่ายเงินช่วยเหลือ การรวมจุดอากาศเป็นค่าเฉลี่ยจังหวัดต้องมีวิธีถ่วงน้ำหนักพื้นที่แยกต่างหาก

### ตรวจสอบราคาและผลผลิต

ใช้ `current_price`, `reference_price`, `current_production`, `reference_production` ราคาเปรียบเทียบได้เมื่อ `commodity_id`, `market_id`, `price_type`, `grade`, `season`, `unit`, `definition` ตรงกัน ผลผลิตใช้สินค้า ฤดู หน่วย และนิยามเดียวกัน โดยค่าฐานต้องเกิดก่อนค่าปัจจุบัน ไม่ join ตารางอากาศรายวันกับผลผลิตรายปีเพื่อคูณยอด

คำนวณ `(current / reference) - 1` เฉพาะเมื่อค่าฐานมากกว่า 0 ราคาหรือผลผลิตเปลี่ยนมากกว่าเกณฑ์ทดลองให้ `watch` ค่าเกณฑ์ 20% และ 15% ยังต้อง backtest ตามสินค้าและตลาด การเปลี่ยนพร้อมกันไม่ยืนยันเหตุและผล อายุข้อมูลราคาสูงสุด 7 วัน และผลผลิต 550 วันเป็นนโยบายทดลองที่ต้องปรับตามรอบเผยแพร่จริง

## Forecast API

```python
available_history(records, issue_at)  # Latest revision publicly available then.
backtest(records, horizon_days=7, policy=None, as_of=None)
forecast(records, issue_at, horizon_days=7, policy=None)
```

รายการข้อมูลรายวันต้องมี `observed_at`, `release_at`, `value`, `source_id`, `unit`, `series_id`, `data_kind` โดย `data_kind` เป็น `observed` หรือ `official` เท่านั้น ถ้ามี `area_code`, `commodity_id`, `market_id`, `price_type`, `grade` ต้องเหมือนกันทั้งชุดข้อมูล ไม่รวมหลายตลาดหรือหลายหน่วยเข้าด้วยกัน วันวัดต้องเป็น date หรือเที่ยงคืน UTC; ไม่รับราคา intraday/รายเดือน/รายปีผ่านโมเดลนี้

`release_at` ที่ไม่ทราบ, NaN, infinity, วันเผยแพร่ก่อนวันวัด, datetime ไม่มี timezone และ revision ที่ค่าไม่ตรงกันแต่วันเผยแพร่เดียวกัน จะถูกปฏิเสธด้วย `ValueError` ค่า null ใช้แทน missing ได้ ถ้า revision ล่าสุดแก้ค่ากลับเป็น null จะไม่หยิบค่ารุ่นเก่ามาแทน

1. ที่แต่ละวันออกพยากรณ์ ใช้เฉพาะ `observed_at <= issue_at` และ `release_at <= issue_at` โดยเลือก revision ล่าสุดที่มีสิทธิ์รู้ในเวลานั้น
2. ทดสอบ last-value baseline กับ moving median 7 รายการย้อนหลังที่มีค่า ช่วงพยากรณ์รองรับ 7/30/90 วันแยกกัน
3. ต้องมีข้อมูลรายวันอย่างน้อย 30 ค่า missing ไม่เกิน 10% ของช่วงตั้งแต่วันแรกถึงวันออกพยากรณ์ และอย่างน้อย 20 folds ที่ใช้ตรวจสอบได้
4. เลือกโมเดลและคำนวณ quantile ของ residual ใน folds ช่วงเก่าครึ่งแรก ข้อมูลจริงใน calibration ต้องเผยแพร่แล้วก่อนวันออกพยากรณ์แรกของ verification เพื่อกันการรั่วไหลจาก horizon ที่ทับซ้อนกัน
5. ใช้ folds ช่วงใหม่ครึ่งหลังตรวจ MAE/RMSE/Bias/WAPE, skill เทียบ last-value และช่วงคาดการณ์ p10/p90 จาก residual จริง ต้องมี calibration อย่างน้อย 10 folds หลังเว้นช่วงทับซ้อน MAE ต้องไม่แย่กว่า baseline และ interval coverage อย่างน้อย 70% สำหรับช่วง nominal 80% ค่าเหล่านี้เป็น gate ทดลอง
6. ถ้า gate ใดไม่ผ่าน คืน `status=suppressed`, `classification=Unknown` และ `point_estimate/p10/p90=null` ไม่มีตัวเลขพยากรณ์แสดงโดยไร้หลักฐาน

เป้าหมายสำหรับ scoring ใช้ actual ฉบับเผยแพร่ครั้งแรกของแต่ละวันตาม lineage ไม่แอบแทนด้วย revision ที่แก้ภายหลัง รายงานเก็บวันเผยแพร่และ revision ของ actual แต่ละ fold การประเมินมี `as_of` กำกับ; `forecast` ตั้งเป็น `issue_at` เสมอ จึงไม่ใช้ actual หรือ revision ที่ยังไม่เผยแพร่เพื่อรับรองการพยากรณ์ในอดีต

ค่า `eligible` หมายถึงผ่านเกณฑ์ทางซอฟต์แวร์ของชุดข้อมูลและ horizon นั้น ยังไม่ใช่อนุมัติเปิดใช้งานจริง ไม่มี forecast จริงถูกสร้างจากประวัติสังเคราะห์ใน tests และไม่มีการอ้างว่าผ่านผู้เชี่ยวชาญหรือดีกว่าตลาดจริง

ยังไม่ทำ seasonal model รายปี, uncertainty สำหรับเหตุการณ์สุดขั้ว, crop-water balance หรือการรับรองผลกระทบต่อการตัดสินใจ โมเดลเชิงทดลองนี้ประมวลผลข้อมูลขนาดเล็กในหน่วยความจำ; ถ้าประวัติรายวันมากจน backtest ช้า ค่อยเปลี่ยนวิธีเลือก revision ให้เป็น incremental
