# Numeric source candidate review

ตรวจหลักฐาน 24 ตุลาคม 2569 เพื่อเลือกงาน M4 ใน [implementation plan](../IMPLEMENTATION_PLAN.md) รอบนี้อ่านเอกสารทางการและทะเบียนเดิม ไม่ดึงตัวเลขใหม่ ไม่แก้สถานะสิทธิ์ และไม่อนุมัติการเผยแพร่แทนเจ้าของข้อมูล

## M4 update: CHIRPS v3.0 Daily final RNL, 25 ตุลาคม 2569

ตรวจ resource URL โดยตรงและเอกสาร CHC: [exact GeoTIFF วันที่ 2026-09-30](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif). CHC ระบุ CHIRPS3 เป็น public domain และ CC BY 4.0; daily README กำหนด grain เป็น grid/date label UTC และวิธี rnl ใช้ ERA5 กระจาย pentad เป็น daily. Header ให้ ETag/revision, EPSG:4326, 0.05° grid, float32; missing `-9999` เป็น null. รายละเอียดอยู่ใน [M4 resource audit](m4-chirps-resource.md).

**M4 ผ่านเฉพาะ exact file นี้** และเพิ่มเป็น `approved_public` ในทะเบียนพร้อม attribution CHIRPS3 DOI `10.15780/G2JQ0P`, Funk et al. (2026), ลิงก์ CC BY 4.0 และการแจ้งการเปลี่ยนแปลง. M5 อ่าน raster แบบ bounded และเทียบ 3 cells กับ source ด้วย ETag-pinned HTTP ranges แล้ว โดยรักษา grain grid-cell × UTC-date; ยังไม่มี active D1 run หรือ public numeric API output. ดู [M5 sample](m5-chirps-sample.md).

## M3 update: non-CKAN API candidates, 25 ตุลาคม 2569

ผล probe แบบจำกัดเวลาและไม่บันทึกตัวเลขอยู่ใน [M3 API candidate audit](m3-api-candidate-audit-2026-10-25.md): NASA POWER metadata endpoint ใช้สำหรับ metadata discovery เท่านั้น; Open-Meteo ERA5 daily precipitation เป็น numeric candidate เมื่อผู้รับผิดชอบยืนยันว่า Free API ใช้ในขอบเขต non-commercial และจัด attribution ครบ; RID และ NABC ยังขาดหลักฐานสิทธิ์เผยแพร่; MOC timeout จึงยังตรวจ schema ไม่ได้; GISTDA ต้องมี API key. ไม่มี candidate เหล่านี้ถูกอนุมัติหรือเปลี่ยนสถานะในทะเบียน

ตัวเลือกอื่นที่ตรวจเพิ่มยังไม่ผ่าน M4: NASA POWER `T2M` ไม่มีเงื่อนไขเผยแพร่ซ้ำราย resource; OAE export CSV บน data.go.th ไม่มี license version/URL และ metadata ขัดกันเรื่อง import/export ([audit](data-gov-numeric-candidate-audit.md)); ราคา OAE เขต 10 ชี้ไปหน้า HTML ที่ไม่มี schema ชัด.

## ข้อเสนอ

ให้เริ่มขอ sign-off สำหรับ Open-Meteo Historical Weather API รุ่น ERA5 โดยจำกัดเป็นฝนรายวันจาก grid cell ที่ระบุชัดเจน เหมาะทำกราฟบริบทสภาพอากาศจากแหล่ง API สาธารณะ และ terms ระบุ CC BY 4.0 สำหรับข้อมูล แต่ยังห้ามตั้ง `approved_public`: Free API จำกัดการใช้ไว้ที่ non-commercial และต้องยืนยันว่าการให้บริการของ Hub เข้าเงื่อนไขนี้ พร้อมวางเครดิตให้ถูกต้อง

OAE/NABC ราคาข้าวเป็นข้อมูลเกษตรที่ตรงกับผู้ใช้มากกว่า แต่ยังมีเพียงป้าย non-commercial ที่ไม่ระบุรุ่น/URL และยังไม่มีหลักฐานเงื่อนไขของ NABC API ที่ชัด จึงยังไม่ควรเป็น numeric source แรกที่เผยแพร่

| Candidate | ประโยชน์ | Grain / หน่วย | สิทธิ์และข้อจำกัด | ความพร้อมเผยแพร่ |
|---|---|---|---|---|
| Open-Meteo Historical API, ERA5 daily precipitation | ใช้ดูบริบทฝนตามช่วงเพาะปลูกและตั้งคำถามตรวจพื้นที่ | grid cell, วัน, `precipitation_sum` หน่วย mm; ERA5 ประมาณ 0.25° หรือ 25 km | ข้อมูล CC BY 4.0; Free API ใช้ non-commercial เท่านั้น มี rate limits และ attribution | **มีเงื่อนไข** ต้องให้ผู้รับผิดชอบยืนยันการใช้ API และรูปแบบเครดิตก่อน |
| OAE/NABC monthly jasmine paddy price | ดูแนวโน้มราคารับซื้อข้าวหอมมะลิระดับประเทศ | ประเทศ `TH00`, สินค้า/ความชื้น 15%, เดือน; API ระบุหน่วย `บาท/ตัน` ใน adapter ปัจจุบันและแปลงเป็น `THB/kg` | OAE ระบุ `Creative Commons Attributions Non-Commercial` แต่ไม่มี version/URL; ขอบเขต NABC API ยังไม่ยืนยัน | **ยังไม่พร้อม** ต้องขอ OAE/NABC ยืนยัน license, API terms, attribution และการใช้ของโครงการ |

## Open-Meteo: ตัวเลือกแรกที่ควรขออนุมัติ

- API ที่พิจารณา: [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), endpoint `https://archive-api.open-meteo.com/v1/archive`; ไม่ใช้ forecast เป็น observation
- ขอเฉพาะ `model=era5`, `daily=precipitation_sum`, `precipitation_unit=mm`, `timezone=Asia/Bangkok` และช่วงวันที่จำเป็น รุ่น ERA5 มีข้อมูลตั้งแต่ปี 1940 ความละเอียดราว 25 km และอัปเดตช้าประมาณ 5 วันตามเอกสารผู้ให้บริการ
- ต้องบันทึก requested coordinate และ grid-cell coordinate/elevation ที่ API ตอบกลับ; ตำแหน่งของ grid cell อาจไม่ตรงพิกัดที่ขอ จึงห้ามเรียกเป็นสถานีหรือค่าเฉลี่ยจังหวัด
- เอกสารบอกว่า daily fields ต้องมี timezone; `precipitation_sum` รวมฝนรายวันเป็น mm. ERA5-Land ละเอียดกว่า แต่ตารางตัวแปรของ API ระบุว่า precipitation ไม่พร้อมใน ERA5-Land จึงอย่าเลือก model นี้สำหรับฝนโดยอัตโนมัติ
- ผู้ให้บริการระบุว่า API data ใช้ CC BY 4.0, แจกจ่ายและดัดแปลงได้เมื่อให้เครดิตและแจ้งการเปลี่ยนแปลง; Free API จำกัดไว้สำหรับ non-commercial use ต่ำกว่า 10,000 calls/day, 5,000/hour และ 600/minute. ผู้ให้บริการเตือนว่า serverless providers เช่น Netlify อาจติด rate limit ก่อนเกณฑ์ดังกล่าว
- Hub แบบบริการสาธารณะของหน่วยงานอาจเข้าเงื่อนไข non-commercial แต่ข้อความนี้ยังเป็นการประเมิน ไม่ใช่การอนุมัติ ให้ผู้รับผิดชอบยืนยันว่าไม่มีโฆษณา/สมาชิก/การขายต่อ และตรวจวิธีเรียกจาก server/runner กับข้อกำหนดปัจจุบันก่อนเปลี่ยนทะเบียน
- เครดิตขั้นต่ำที่ทะเบียนเดิมเสนอคือ “Weather data by Open-Meteo.com” พร้อมลิงก์ผู้ให้บริการและลิงก์ CC BY 4.0; แสดง model, หน่วย, เวลาที่ดึง และคำเตือนว่าเป็นข้อมูล reanalysis ไม่ใช่ค่าตรวจวัดสถานี

**ขอบเขตใช้งานที่เหมาะ:** ใช้เป็นหลักฐานประกอบว่าฝนใน grid cell เปลี่ยนอย่างไรในฤดู/ช่วงเวลาที่สนใจ ชวนให้เจ้าหน้าที่ตรวจฝนจากสถานีหรือข้อมูลพื้นที่จริงต่อ ห้ามใช้ค่า grid จุดเดียวสรุปความเสียหาย ผลผลิต หรือ coverage ทั้งจังหวัด ประเทศไทย หรือแปลงเกษตร

**ทางเชื่อมเมื่อผ่านสิทธิ์:** เพิ่ม source-specific job ใน `src/tadih/` ที่เรียก API ฝั่ง runner แบบจำกัดช่วง/พิกัดและบันทึกเฉพาะ normalized observations กับ provenance ลง Hub DB หลังตั้งฐานแล้ว ปล่อย response ผ่าน numeric repository เมื่อ batch สำเร็จและ source access ผ่าน ใช้ request เดียวที่ระบุพิกัด/model/ช่วงเวลาเป็น focused smoke check; ไม่เรียกจาก browser ต่อผู้ใช้ทุกครั้งและไม่เก็บ raw payload ไว้ใน checkout

## OAE/NABC: เกษตรตรงกว่า แต่สิทธิ์ยังค้าง

- Exact source: [OAE monthly_prices_rice](https://catalog.oae.go.th/api/3/action/package_show?id=monthly_prices_rice), resource `4570daca-e727-4036-bde9-35fd84d0ffd4`; resource URL ชี้ไป [NABC monthly price API](https://agriapi.nabc.go.th/api/monthly-prices/product?product_name=%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B9%80%E0%B8%88%E0%B9%89%E0%B8%B2%E0%B8%AB%E0%B8%AD%E0%B8%A1%E0%B8%A1%E0%B8%B0%E0%B8%A5%E0%B8%B4%20%E0%B8%84%E0%B8%A7%E0%B8%B2%E0%B8%A1%E0%B8%8A%E0%B8%B7%E0%B9%89%E0%B8%99%2015&page=1&limit=100)
- OAE อธิบายเป็นราคารายเดือนที่เกษตรกรขายได้ ณ ไร่นา เฉลี่ยระดับประเทศ สินค้าข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15%; ไม่ใช่ราคาจังหวัดหรือราคาตลาดค้าปลีก
- Existing adapter ที่ `src/tadih/ingestion.py` รับ `บาท/ตัน` สำหรับ resource นี้และแปลงเป็น `THB/kg` ด้วยการหาร 1,000; ให้ตรวจ unit ใน live response อีกครั้งก่อน sync และหยุดเมื่อ source เปลี่ยน unit
- OAE metadata ใช้ `license_id=อื่นๆ`, `license_id_other=Creative Commons Attributions Non-Commercial`; ไม่มี version หรือ license URL. รายละเอียดและหลักฐานอยู่ใน [source-license-register](source-license-register.md). คำประกาศของ OAE ยังไม่ยืนยันข้อกำหนด service ของ endpoint NABC
- ห้ามรวม series นี้กับข้าวคนละชนิด/ความชื้น/ฤดู/หน่วย หรือกระจาย national value ไปยังจังหวัด
- ขั้นต่อไปคือให้ OAE/NABC ยืนยัน license version, attribution, การใช้ใน Hub, การเก็บประวัติ/เผยแพร่ซ้ำ และ API stability เป็นลายลักษณ์อักษร จากนั้นจึงใช้ adapter เดิมที่ `src/tadih/ingestion.py` และ `src/tadih/prices.py` ต่อ โดยยังต้องผ่าน Hub publication gate

## ตรวจเพิ่ม: ราคาสินค้าเกษตร OAE เขต 10

ตรวจ [ชุดข้อมูลบน data.go.th](https://data.go.th/th/dataset/roae10_price-weekly) และ [package metadata](https://data.go.th/api/3/action/package_show?id=roae10_price-weekly) เมื่อ 25 ต.ค. 2569: แหล่งระบุสำนักงานจังหวัดราชบุรี, ความถี่รายสัปดาห์, ขอบเขตระดับจังหวัด, ช่วงข้อมูลถึงปี 2568 และ `license_id=Creative Commons Attributions`; เงื่อนไขการเข้าถึงระบุสาธารณะ/ไม่มีข้อจำกัด แต่ API คืน `license_url=null`.

Resource `c15021e2-5bc6-4ac9-ad01-7c9ce1b6d70e` เป็น URL ไปหน้า HTML ของสำนักงานเศรษฐกิจการเกษตรที่ 10 ไม่ใช่ไฟล์ข้อมูลมี schema ชัดเจน; หน้าเว็บตอบ HTTP 200 แต่ HTML ที่ตรวจไม่มี `<table>` ให้ระบุสินค้า หน่วย ตลาด และวันข้อมูลได้ จึงยังยืนยัน license version/เงื่อนไขของไฟล์ต้นทางและโครงสร้างค่าจริงไม่ได้ คงเป็น candidate เท่านั้น ไม่เพิ่มทะเบียนหรือเปิดตัวเลขจนกว่าจะได้ license URL/หลักฐานที่ชัดและสัญญาข้อมูลของ resource.

## หลักฐานทางการและใน repository

- Open-Meteo [Terms & Privacy](https://open-meteo.com/en/terms), [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), [Pricing and attribution](https://open-meteo.com/en/pricing), [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)
- OAE [resource metadata](https://catalog.oae.go.th/api/3/action/resource_show?id=4570daca-e727-4036-bde9-35fd84d0ffd4), [source license review](source-license-register.md) และ [price readiness](price-history-readiness.md)
- NABC [official API landing page](https://agriapi.nabc.go.th/); จากการค้นครั้งนี้ไม่พบเอกสารเงื่อนไขเผยแพร่ซ้ำของ NABC ที่ระบุชัดสำหรับ endpoint รายเดือนดังกล่าว

ผล review วันที่ 24 ต.ค. ยังคงใช้กับ Open-Meteo ERA5 และ OAE/NABC rice ซึ่งยัง `pending`. การตรวจ CHIRPS วันที่ 25 ต.ค. เพิ่ม resource ที่ผ่าน M4 หนึ่งไฟล์และเทียบ source values 3 cells แล้ว; D1 ยังไม่มี observations จาก CHIRPS และ M5 ยังรอ live write กับ preview/API acceptance.
