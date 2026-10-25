# ทะเบียนตรวจสิทธิ์ราย resource

หลังรอบ P2/acquisition audit และตรวจ CHIRPS เพิ่มวันที่ 25 ต.ค. 2569 ทะเบียนมี **82 รายการ**: CHIRPS v3 exact file หนึ่งรายการเป็น `approved_public`; อีก 81 รายการยัง `pending`. ตรวจนับซ้ำเมื่อ 25 ต.ค. 2569 ด้วย `python -c "import json,collections; d=json.load(open('config/resource_licenses.json',encoding='utf-8')); print(len(d['resources']), collections.Counter(r['license_status'] for r in d['resources']))"` แล้วได้ `82 Counter({'pending': 81, 'approved_public': 1})`. ตรวจ live catalog ครบ pagination และ raw hashes แล้ว ดู [ขอบเขต/หลักฐาน](doae-acquisition-audit.md) ข้อมูลชื่อ/รหัส/ติดต่อ/free text ไม่ออก public artifacts การรับข้อมูลครบไม่ได้อนุมัติใช้ซ้ำหรือรับรองโมเดล

ตรวจวันที่ 22–25 ตุลาคม 2569 จาก metadata และเงื่อนไขของผู้ให้บริการโดยตรง ผลแบบอ่านด้วยโปรแกรมอยู่ใน [resource_licenses.json](../config/resource_licenses.json) พร้อม URL หลักฐาน วันที่ตรวจ และ SHA-256 ของคำตอบที่ตรวจผ่านคำขอจริงเมื่อมี

มีเพียง CHIRPS v3.0 Daily final RNL วันที่ 2026-09-30 ที่ได้รับ `approved_public` ในทะเบียน จาก license ของ CHC ซึ่งครอบคลุมชุด CHIRPS3 และ CC BY 4.0; เทียบ source values 3 cells แล้ว แต่ยังไม่มี active D1 run/observation หรือ numeric public API output. รายการอื่นคง pending ตามหลักฐานราย resource.

| Resource ที่ตรวจ | หลักฐานที่พบ | สถานะโครงการ |
|---|---|---|
| DOAE ผลผลิตพืชอายุสั้นระดับตำบล ปี 2566 `f9ab6055-6364-4f78-812e-15989e300979` | ชื่อสัญญาอนุญาต Open Data Common; ไม่มี URL หรือรุ่น | pending |
| OAE/NABC ราคาข้าวเปลือกเจ้าหอมมะลิรายเดือน `4570daca-e727-4036-bde9-35fd84d0ffd4` | ระบุ Creative Commons Attributions Non-Commercial; ไม่มีรุ่นหรือ URL | pending |
| DOPA `ccaatt.xlsx` | ดาวน์โหลดจากเว็บไซต์ทางการได้; ยังไม่พบเงื่อนไขนำไฟล์นี้ไปเผยแพร่ซ้ำ | pending |
| DDPM ขอบเขตจังหวัด `FeatureServer/1` | item เป็น public; ช่อง licence และเครดิตว่าง | pending |
| Open-Meteo ERA5 เฉพาะพิกัดไทย | ข้อมูล CC BY 4.0; API ฟรีจำกัดงานไม่เชิงพาณิชย์ | pending การใช้บริการและ attribution |
| Open-Meteo forecast เฉพาะพิกัดไทย | เงื่อนไขข้อมูลและ API ชุดเดียวกับ ERA5 | pending การใช้บริการและ attribution |
| RID รายงานอ่างเก็บน้ำขนาดกลางรายวัน | API สาธารณะไม่มี API key; เอกสารไม่ระบุสัญญาอนุญาตเผยแพร่ต่อ | pending |
| MODIS 16-Day NDVI/QA Planetary Computer | Open data / US Gov Work; Microsoft API terms; pending publication review | pending |
| LDD สถิติความเหมาะสมดินปลูกข้าวระดับจังหวัด `7f508d88-3c31-4cad-b95a-68ca0ce89356` | ระบุ CC Attribution No-Derivs; เผยแพร่ระหว่างหน่วยงาน; ยังไม่ระบุหน่วยและปีสำรวจ | pending |
| DOF สถิติผลผลิตสัตว์น้ำปริมาณและมูลค่ารายปี | ระบุ Open Data Common; data_category=สาธารณะ แต่ isopen=false; ยังไม่ระบุนิยามปี | pending |
| DLD มูลค่าผลผลิตปศุสัตว์ระดับประเทศ `a512df83-39d0-420b-979e-942666863b00` | ระบุ Open Data Common; ยังไม่ระบุรุ่นและเงื่อนไขเผยแพร่ซ้ำ | pending |
| DOAE ผลผลิตพืชอายุยาวระดับตำบล ปี 2566 `61f3f241-92c7-4cdc-9918-41ce73545268` | ระบุ Open Data Common; มี 5 repeated identities และ 3 ค่าพื้นที่ติดลบ | pending |
| DOAE แผนเพาะปลูกฤดูแล้งรายตำบล ปี 2569 `a7ce04a9-3535-4e88-98f5-7bc50fa63b2e` | ตรวจเพิ่ม 23 ต.ค. 2569 ระบุ `อื่นๆ`; ยังไม่มีสิทธิ์เผยแพร่ซ้ำที่ยืนยัน | pending |
| LDD สถิติแผนและผลโครงการ PGS `2feb3230-cf86-4560-95f5-93e58270a7d8` | ระบุ CC Attribution Non-Commercial No-Derivs; หน่วยงานผู้รายงานไม่เท่ากับพื้นที่เป้าหมาย | pending |
| CHIRPS v3.0 daily final RNL `2026-09-30` | CHC ระบุ public domain และ CC BY 4.0; บันทึก exact file, ETag, grid metadata และ attribution; เทียบ 3 source cells ด้วย ETag-pinned ranges แล้ว | approved_public ในทะเบียน; D1 write/API acceptance ยัง pending |


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

## DOAE แผนเพาะปลูกฤดูแล้งปี 2569

รอบ P1/RAR ลงทะเบียน exact resources เพิ่มอีก 25 รายการ (21 CSV/JSON/GIS + 4 RAR) รวมทั้งทะเบียนเป็น 58 รายการ คง pending ทั้งหมด พร้อม raw SHA-256/ขนาด และ dataset metadata evidence; รายกลุ่มวิสาหกิจยังเก็บภายในและรอ privacy review ดู [รายละเอียด](doae-p1-archives.md)

รอบ P0 ขยายทะเบียนเพิ่ม exact CSV resources ครบ 21 ไฟล์ใน 10 datasets โดยคง pending และบันทึก metadata snapshot/hash, URL และ raw CSV hash/ขนาดของทุกไฟล์ ดู [ผลดึงและขอบเขต](doae-p0-ingestion.md) รอบ P0 ทั้งทะเบียนรวมแหล่งเดิมมี 33 รายการ ไม่มีรายการใหม่อนุมัติเผยแพร่จากการดาวน์โหลดสำเร็จ

ตรวจ [metadata plan_dryplant](https://ckan.doae.go.th/api/3/action/package_show?id=plan_dryplant) และ resource `a7ce04a9-3535-4e88-98f5-7bc50fa63b2e` เมื่อ 23 ต.ค. 2569 พบ `license_id`/`license_title` เป็น `อื่นๆ` จึงยังยืนยันสิทธิ์ใช้ซ้ำหรือเผยแพร่ไม่ได้ ทะเบียนคง `pending` และการอนุมัติเผยแพร่/เชิงพาณิชย์เป็น false ข้อมูล staging 599 แถวเก็บในเครื่อง ดู [ขอบเขตและหลักฐาน](plan-dryplant.md) จำนวน resources ในทะเบียนปัจจุบันเป็น 82 (pending 81, approved_public 1; ตรวจนับ 25 ต.ค. 2569) ไม่ได้เปลี่ยนสถานะของ resource ใดในรอบนี้; metadata timestamp และ row updated_at ยังไม่ใช้แทน release_at

## DDPM ขอบเขตจังหวัด

ตรวจ [layer metadata](https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/1?f=pjson) และ [portal item](https://gis-portal.disaster.go.th/portal/sharing/rest/content/items/7de09c697313497fa54ce4697db2a89a?f=pjson) แล้ว เข้าถึงได้แบบ public และมี polygon 77 จังหวัด

ช่อง `licenseInfo`, `accessInformation` ของ item และ `copyrightText` ของ layer ว่าง การเปิด Query/Extract เป็นหลักฐานการเข้าถึง ส่วนสิทธิ์เผยแพร่ GeoJSON หรือ geometry ที่ลดรายละเอียดแล้วยังต้องยืนยัน ต้องขอเงื่อนไขของ layer นี้หรือเลือกข้อมูลทางการชุดอื่นที่ระบุสัญญาอนุญาตไว้ก่อนเปิดแผนที่สาธารณะ

## Open-Meteo ERA5 และ forecast

[หน้า licence ของ Open-Meteo](https://open-meteo.com/en/licence) ระบุข้อมูล API เป็น [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) อนุญาตการแบ่งปันและดัดแปลง พร้อมเครดิตที่คลิกกลับไปยังผู้ให้บริการ ลิงก์สัญญาอนุญาต และแจ้งการเปลี่ยนแปลง ต้องวางเครดิตใกล้ส่วนที่แสดงข้อมูล

[Terms](https://open-meteo.com/en/terms) จำกัดบริการ API ฟรีไว้สำหรับงานไม่เชิงพาณิชย์ งานเชิงพาณิชย์ต้องใช้ช่องทางบริการที่รองรับ จึงคงสถานะโครงการเป็น pending จนบันทึกลักษณะการใช้บริการและจัด attribution ครบ ความถูกต้องของพื้นที่ยังยึดเฉพาะพิกัดไทยที่ผ่านการตรวจ ไม่ขยายเป็นสิทธิ์เก็บข้อมูลทั่วโลก

เอกสารผลิตภัณฑ์ที่ตรวจคือ [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) และ [Forecast API](https://open-meteo.com/en/docs) โดย ERA5 คงชนิด reanalysis ส่วนผลพยากรณ์คงชนิด forecast ตามสัญญาข้อมูลเดิม

## RID รายงานอ่างเก็บน้ำขนาดกลาง

ตรวจ [เอกสาร API](https://app.rid.go.th/reservoir/api/document/reservoir) และ [endpoint สาธารณะ](https://app.rid.go.th/reservoir/api/reservoir/public) แล้ว พบว่าเป็นบริการ JSON สาธารณะที่ไม่ต้องใช้ API key รายงานระบุปริมาณน้ำ ความจุ dead storage และเปอร์เซ็นต์น้ำรายอ่าง

เอกสารกำกับอธิบายชื่อพารามิเตอร์และโครงสร้างข้อมูล แต่ยังไม่ระบุสัญญาอนุญาตเปิดเผยหรือเงื่อนไขการเผยแพร่ซ้ำ/เชิงพาณิชย์ นอกจากนี้หน่วยของ inflow และ outflow ไม่ได้ระบุไว้ในเอกสาร (เก็บเฉพาะ raw) และข้อมูลไม่มีพิกัดหรือรหัสจังหวัดทางการ จึงต้องคงสถานะเป็น pending และไม่กระจายข้อมูลลงจังหวัด

## MODIS ดัชนีพืชพรรณผ่าน Planetary Computer

ตรวจ [นโยบายข้อมูล NASA LP DAAC](https://lpdaac.usgs.gov/data/data-citation-and-policies/) และ [เงื่อนไข Planetary Computer](https://planetarycomputer.microsoft.com/terms) แล้ว ข้อมูล MODIS เป็นงานของรัฐบาลสหรัฐฯ เปิดเผยสาธารณะโดยไม่มีข้อจำกัด และ Microsoft ให้บริการ STAC API และ raster point extraction แบบสาธารณะ

การดึงค่าดัชนีพืชพรรณ (NDVI), Pixel Reliability (Cloud mask) และ VI Quality เฉพาะจุดพิกัดในประเทศไทยต้องรักษา grain เป็น grid_point พร้อมบันทึก scale factor (0.0001) และ fill value (-3000 เป็น null) สถานะสิทธิ์ในโครงการคงเป็น pending สำหรับการตรวจทานเงื่อนไขเผยแพร่ซ้ำและยืนยัน cloud mask กับฤดูกาลจริงในพื้นที่ก่อนเปิดสาธารณะ

## LDD ความเหมาะสมของดินสำหรับการปลูกข้าว

ตรวจชุดข้อมูล `lpd` บน [LDD Catalog](https://lddcatalog.ldd.go.th/dataset/lpd) และ datastore รายจังหวัด `7f508d88-3c31-4cad-b95a-68ca0ce89356` ชุดข้อมูลระบุสัญญาอนุญาต `Creative Commons Attribution No-Derivs` และ `isopen=false` พจนานุกรมข้อมูลระบุขอบเขตการเผยแพร่เป็น "ระหว่างหน่วยงาน"

ตารางสถิติรายจังหวัด 77 แถวไม่ระบุหน่วยตัวเลข (ไร่ หรือ ตารางเมตร) และไม่ระบุปีสำรวจหรือปีอ้างอิง จึงคงสถานะเป็น `pending` และ `unit_and_survey_year_unverified` โดยไม่นำเข้า DuckDB warehouse หรือเผยแพร่สาธารณะจนกว่าจะยืนยันหน่วย ปีสำรวจ และเงื่อนไขการดัดแปลง

## DOF ผลผลิตสัตว์น้ำปริมาณและมูลค่า

ตรวจชุดข้อมูล `dofd07_05_0101_02` บน [Fisheries Catalog](https://catalog.fisheries.go.th/dataset/dofd07_05_0101_02) ทรัพยากรปริมาณ `42c751e0-0569-4df6-9580-a0f80c123b0f` (พันตัน) และมูลค่า `87357769-f93c-482d-adb2-2c83c49bf3c6` (ล้านบาท) รวม 27 ปี (2541–2567)

ชุดข้อมูลระบุ `Open Data Common` และ `data_category=ข้อมูลสาธารณะ` แต่ระบุ `isopen=false` และยังไม่ระบุนิยามปี (ปีปฏิทินหรือปีงบประมาณ) รวมถึงวันเผยแพร่ย้อนหลังรายปี จึงคงสถานะเป็น `pending` และแยกยอดรวมระดับประเทศออกจากกลุ่มสัตว์น้ำ 9 ชนิด ไม่บวกซ้ำ

## DLD มูลค่าผลผลิตปศุสัตว์ระดับประเทศ

ตรวจทรัพยากร `a512df83-39d0-420b-979e-942666863b00` บน [DLD Catalog](https://catalog.dld.go.th/) มี 35 แถว 5 กลุ่มสินค้า ปี 2562–2568 หน่วยล้านบาท

ระบบระบุสัญญาอนุญาต `Open Data Common` โดยไม่มี URL รุ่นของสัญญาอนุญาตหรือเงื่อนไขการเผยแพร่ต่อที่ระบุชัดเจน และยังไม่ทราบนิยามปีปฏิทิน/ปีงบประมาณ จึงคงสถานะเป็น `pending` และรักษา spatial grain เป็นระดับประเทศ (national)

## DOAE ผลผลิตพืชอายุยาวระดับตำบล ปี 2566

ตรวจทรัพยากร `61f3f241-92c7-4cdc-9918-41ce73545268` บน [DOAE CKAN](https://ckan.doae.go.th/dataset/6cc09797-a60e-43ce-a646-65364a1333c3) จำนวน 54,195 แถว

ชุดข้อมูลระบุ `Open Data Common` แบบไม่มีรุ่นกำกับเช่นเดียวกับพืชอายุสั้น และจากการตรวจสอบพบประเด็นข้อมูลค้าง: 5 กลุ่ม repeated identities ที่มีค่าขัดแย้ง และ 3 แถวที่ค่าพื้นที่ติดลบ จึงต้องคงสถานะเป็น `pending` และเก็บใน staging/quarantine ไม่นำเข้า warehouse จนกว่าจะได้ข้อยุติ

## LDD สถิติแผนและผลโครงการ PGS

ตรวจทรัพยากร `2feb3230-cf86-4560-95f5-93e58270a7d8` (202 แถว) และพจนานุกรมข้อมูล `186d7cee-2443-4fc7-8a77-c7b7d574ea77` (11 แถว) บน [LDD Catalog](https://lddcatalog.ldd.go.th/dataset/ord02)

ชุดข้อมูลระบุสัญญาอนุญาต `Creative Commons Attribution Non-Commercial No-Derivs` พจนานุกรมระบุขอบเขตเปิดเผยเป็น Open Data แต่ยังไม่ได้รับการอนุมัติการเผยแพร่ต่อในระดับโครงการ จึงคงสถานะเป็น `pending` ข้อมูลถูกจัดเก็บในเครื่องเพื่อแสดงใน Workstation Session และหน้า `/projects` โดยรักษา Native Reporting Unit (หน่วยงานผู้รายงาน) ไม่เทียบเท่ากับพื้นที่เป้าหมายหรือจังหวัดที่ได้รับประโยชน์ และคงตัวตรวจกรองความปลอดภัยไม่คำนวณร้อยละเมื่อเป้าหมายเป็นศูนย์หรือขาดค่า

## CHIRPS v3.0 Daily final RNL วันที่ 2026-09-30

ตรวจ [หน้า CHC CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3), [daily README](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/readme.txt), [diagnostics](https://www.chc.ucsb.edu/data/chirps3/diagnostics) และ exact [GeoTIFF](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif) วันที่ 25 ต.ค. 2569. CHC ระบุ CHIRPS3 เป็น public domain และ CC BY 4.0; ต้องให้เครดิต, ลิงก์ license, แจ้งการเปลี่ยนแปลง และอ้าง DOI `10.15780/G2JQ0P` กับ Funk et al. (2026). จึงอนุมัติสิทธิ์เฉพาะ file URL นี้สำหรับการเผยแพร่ภายใต้ attribution ข้างต้น.

ตรวจ directory ถึงวันที่ข้อมูล 30 ก.ย. 2569, HTTP 200, ETag `6ad152d4-119211a`, Last-Modified 15 ต.ค. 2569; header ยืนยัน EPSG:4326, 0.05° grid, float32 และ pixel-is-area. Grain เป็น grid cell × UTC date; daily RNL กระจายยอด pentad โดย ERA5 ไม่ใช่ daily gauge observation และไม่ใช่จังหวัด. ค่า bad/missing `-9999` ต้องเป็น null. License ผ่าน M4 และ M5 เทียบ 3 cells กับค่าจาก source revision เดียวกันแล้ว; ก่อนเปิด API ยังต้องตรวจ live D1 ingestion และ API/UI บน current preview.

## การใช้ทะเบียนนี้

ทะเบียนนี้ไม่มีผลอนุมัติอัตโนมัติ `pending` หมายถึงยังปิดเงื่อนไขสำหรับการใช้และเผยแพร่ของโครงการไม่ครบ เมื่อได้หลักฐานเพิ่ม ให้เก็บ URL หรือเอกสารสิทธิ์ วันที่ตรวจ เงื่อนไขการใช้งาน และผู้รับผิดชอบก่อนเปลี่ยนสถานะของ resource จริง การอนุมัติต้องตรงกับไฟล์หรือ endpoint ที่ใช้ รวมถึงเครดิตใน CSV, Parquet, API, หน้าเว็บ Next.js และไฟล์ดาวน์โหลด; ห้ามส่ง pending/restricted หรือข้อมูลส่วนบุคคลผ่าน public HTML/JSON/props/cache

