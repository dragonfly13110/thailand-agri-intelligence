# ทะเบียนตรวจสิทธิ์ราย resource

ตรวจวันที่ 22 ตุลาคม 2569 (2026-10-22) จาก metadata และเงื่อนไขของผู้ให้บริการโดยตรง ผลแบบอ่านด้วยโปรแกรมอยู่ใน [resource_licenses.json](../config/resource_licenses.json) พร้อม URL หลักฐาน วันที่ตรวจ และ SHA-256 ของคำตอบที่ตรวจผ่านคำขอจริงเมื่อมี

ยังไม่มีรายการใดถูกตั้งเป็น `approved_public` การตรวจครั้งนี้เก็บข้อเท็จจริงเรื่องสิทธิ์และเงื่อนไขที่ยังต้องปิดก่อนเผยแพร่ โดยไม่เปลี่ยนสถานะใน warehouse หรือทะเบียน sources เดิม

| Resource ที่ตรวจ | หลักฐานที่พบ | สถานะโครงการ |
|---|---|---|
| DOAE ผลผลิตพืชอายุสั้นระดับตำบล ปี 2566 `f9ab6055-6364-4f78-812e-15989e300979` | ชื่อสัญญาอนุญาต Open Data Common; ไม่มี URL หรือรุ่น | pending |
| OAE/NABC ราคาข้าวเปลือกเจ้าหอมมะลิรายเดือน `4570daca-e727-4036-bde9-35fd84d0ffd4` | ระบุ Creative Commons Attributions Non-Commercial; ไม่มีรุ่นหรือ URL | pending |
| DOPA `ccaatt.xlsx` | ดาวน์โหลดจากเว็บไซต์ทางการได้; ยังไม่พบเงื่อนไขนำไฟล์นี้ไปเผยแพร่ซ้ำ | pending |
| DDPM ขอบเขตจังหวัด `FeatureServer/1` | item เป็น public; ช่อง licence และเครดิตว่าง | pending |
| Open-Meteo ERA5 เฉพาะพิกัดไทย | ข้อมูล CC BY 4.0; API ฟรีจำกัดงานไม่เชิงพาณิชย์ | pending การใช้บริการและ attribution |
| Open-Meteo forecast เฉพาะพิกัดไทย | เงื่อนไขข้อมูลและ API ชุดเดียวกับ ERA5 | pending การใช้บริการและ attribution |

## DOAE ผลผลิตรายตำบล

ตรวจ [resource metadata](https://ckan.doae.go.th/api/3/action/resource_show?id=f9ab6055-6364-4f78-812e-15989e300979), [dataset metadata](https://ckan.doae.go.th/api/3/action/package_show?id=production_doae) และ [หน้าชุดข้อมูล](https://ckan.doae.go.th/dataset/production_doae) แล้ว พบว่าชุดเป็นสาธารณะ และระบุว่าไม่มีข้อจำกัดการเข้าถึง

ช่อง `license_id` เป็น `Open Data Common` ส่วน `license_id_other` ว่าง ไม่มี `license_url` ให้ผูกกับ resource นี้ รายการ [license_list ของ DOAE](https://ckan.doae.go.th/api/3/action/license_list) มี ODC หลายแบบ ได้แก่ PDDL, ODbL และ Attribution แต่ชื่อที่ dataset ใช้ไม่ได้ชี้ไปยังแบบใดแบบหนึ่ง

งานที่ยังต้องทำคือให้เจ้าของชุดระบุสัญญาอนุญาตและรุ่นที่แน่นอน รวมถึงเครดิตและเงื่อนไขของตารางที่นำไปแปลงต่อ ระหว่างนี้ยังไม่นำ raw CSV หรือตารางที่แปลงแล้วออกสาธารณะ

## OAE/NABC ราคาข้าวเปลือกเจ้าหอมมะลิรายเดือน

[ชุด monthly_prices_rice](https://catalog.oae.go.th/api/3/action/package_show?id=monthly_prices_rice) มี resource เดียว โดย [resource metadata](https://catalog.oae.go.th/api/3/action/resource_show?id=4570daca-e727-4036-bde9-35fd84d0ffd4) ชี้ไปยัง NABC API รายเดือนสำหรับสินค้าข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15

ข้อมูลกำหนด `license_id="อื่นๆ"` และ `license_id_other="Creative Commons Attributions Non-Commercial"` จึงมีหลักฐานเรื่องเงื่อนไขไม่เชิงพาณิชย์ แต่ยังขาดรุ่นและ URL ของสัญญาอนุญาตที่ใช้จริง [หน้าชุดข้อมูล](https://catalog.oae.go.th/dataset/monthly_prices_rice) แสดงข้อความเดียวกัน

[license_list ของ OAE](https://catalog.oae.go.th/api/3/action/license_list) มีรายการ `cc-nc` ซึ่งลิงก์ไปยังรุ่น 2.0 แต่ dataset นี้ใช้ ID `อื่นๆ` จึงยังนำรุ่น 2.0 มาใช้เป็นข้อสรุปของ resource นี้ไม่ได้ ต้องยืนยันรุ่น เงื่อนไข API และลักษณะการใช้ในโครงการก่อนเผยแพร่ คำประกาศสิทธิ์ของชุดข้าวนี้ยังไม่ครอบคลุมทุกสินค้าหรือทุก endpoint ของ NABC

## DOPA ทำเนียบท้องที่

[หน้าดาวน์โหลด DOPA](https://stat.bora.dopa.go.th/dload/fccaa.htm) ชี้ไปที่ [ccaatt.xlsx](https://stat.bora.dopa.go.th/dload/ccaatt.xlsx) โดยตรง และอธิบายเครื่องหมายรหัสที่ยกเลิก หน้าเว็บระบุวันที่ปรับปรุง 08/07/2560 แต่หัวตารางในไฟล์ที่ตรวจระบุข้อมูล ณ 1 กันยายน 2566 ต้องเก็บสองวันที่ตามความหมายเดิม

ยังไม่พบสัญญาอนุญาตหรือข้อความให้สิทธิ์เผยแพร่ซ้ำในหน้าดาวน์โหลดและหัว workbook ที่ตรวจ การที่ชุดข้อมูล DOPA รายอื่นบน data.go.th มีสัญญาอนุญาต ไม่เพียงพอสำหรับการกำหนดสิทธิ์ให้ไฟล์นี้ ต้องยืนยันกับเจ้าของ resource ก่อนนำ workbook หรือตารางรหัสที่ถอดออกไปเผยแพร่

## DDPM ขอบเขตจังหวัด

ตรวจ [layer metadata](https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/1?f=pjson) และ [portal item](https://gis-portal.disaster.go.th/portal/sharing/rest/content/items/7de09c697313497fa54ce4697db2a89a?f=pjson) แล้ว เข้าถึงได้แบบ public และมี polygon 77 จังหวัด

ช่อง `licenseInfo`, `accessInformation` ของ item และ `copyrightText` ของ layer ว่าง การเปิด Query/Extract เป็นหลักฐานการเข้าถึง ส่วนสิทธิ์เผยแพร่ GeoJSON หรือ geometry ที่ลดรายละเอียดแล้วยังต้องยืนยัน ต้องขอเงื่อนไขของ layer นี้หรือเลือกข้อมูลทางการชุดอื่นที่ระบุสัญญาอนุญาตไว้ก่อนเปิดแผนที่สาธารณะ

## Open-Meteo ERA5 และ forecast

[หน้า licence ของ Open-Meteo](https://open-meteo.com/en/licence) ระบุข้อมูล API เป็น [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) อนุญาตการแบ่งปันและดัดแปลง พร้อมเครดิตที่คลิกกลับไปยังผู้ให้บริการ ลิงก์สัญญาอนุญาต และแจ้งการเปลี่ยนแปลง ต้องวางเครดิตใกล้ส่วนที่แสดงข้อมูล

[Terms](https://open-meteo.com/en/terms) จำกัดบริการ API ฟรีไว้สำหรับงานไม่เชิงพาณิชย์ งานเชิงพาณิชย์ต้องใช้ช่องทางบริการที่รองรับ จึงคงสถานะโครงการเป็น pending จนบันทึกลักษณะการใช้บริการและจัด attribution ครบ ความถูกต้องของพื้นที่ยังยึดเฉพาะพิกัดไทยที่ผ่านการตรวจ ไม่ขยายเป็นสิทธิ์เก็บข้อมูลทั่วโลก

เอกสารผลิตภัณฑ์ที่ตรวจคือ [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) และ [Forecast API](https://open-meteo.com/en/docs) โดย ERA5 คงชนิด reanalysis ส่วนผลพยากรณ์คงชนิด forecast ตามสัญญาข้อมูลเดิม

## การใช้ทะเบียนนี้

ทะเบียนนี้ไม่มีผลอนุมัติอัตโนมัติ `pending` หมายถึงยังปิดเงื่อนไขสำหรับการใช้และเผยแพร่ของโครงการไม่ครบ เมื่อได้หลักฐานเพิ่ม ให้เก็บ URL หรือเอกสารสิทธิ์ วันที่ตรวจ เงื่อนไขการใช้งาน และผู้รับผิดชอบก่อนเปลี่ยนสถานะของ resource จริง การอนุมัติต้องตรงกับไฟล์หรือ endpoint ที่ใช้ รวมถึงเครดิตใน CSV, Parquet, Power BI และหน้าที่แสดงข้อมูล
